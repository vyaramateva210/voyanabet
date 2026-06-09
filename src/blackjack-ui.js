import { deal, hit, stand, handValue } from './blackjack.js';
import { dealWithSuspense } from './suspense.js';
import { getBlackjackOdds } from './probabilityHUD.js';
import { recordResult, isLocked, getLockoutRemaining } from './responsibleGambling.js';
import { getBalance, updateWallet, onBalanceChange } from './wallet.js';
import { postRound, postLockoutEvent } from './api_client.js';

const MIN_BET     = 5;
const MAX_BET     = 500;
const DEFAULT_BET = 25;
const BET_STEP    = 5;
const FLIP_DELAY  = 150; // half the CSS flip duration
const LOCKOUT_POLL = 500;

const RED_SUITS = new Set(['♥', '♦']);

export function render(container) {
  container.innerHTML = `
    <section class="blackjack-screen">
      <div class="game-header">
        <h2 class="game-title">Blackjack</h2>
        <p class="game-subtitle muted">6-deck shoe · Dealer stands soft 17 · BJ pays 3:2</p>
      </div>

      <div class="lockout-banner hidden" id="bj-lockout">
        <span>⚠</span>
        <span id="bj-lockout-msg">COOLING OFF</span>
      </div>

      <div class="bj-table">
        <div class="bj-zone">
          <div class="zone-label muted">DEALER <span id="dealer-value"></span></div>
          <div class="card-row" id="dealer-cards"></div>
        </div>
        <div class="bj-divider"></div>
        <div class="bj-zone">
          <div class="zone-label muted">PLAYER <span id="player-value"></span></div>
          <div class="card-row" id="player-cards"></div>
        </div>
      </div>

      <div class="result-banner hidden" id="bj-result">
        <span id="bj-result-text"></span>
      </div>

      <div class="bj-controls">
        <div class="bet-controls">
          <button class="btn btn-ghost bet-btn" id="bj-bet-dec">−</button>
          <div class="bet-display">⬡ <span id="bj-bet-value">${DEFAULT_BET}</span></div>
          <button class="btn btn-ghost bet-btn" id="bj-bet-inc">+</button>
        </div>
        <div class="action-btns">
          <button class="btn btn-primary"   id="bj-deal">DEAL</button>
          <button class="btn btn-primary  hidden" id="bj-hit">HIT</button>
          <button class="btn btn-secondary hidden" id="bj-stand">STAND</button>
          <button class="btn btn-secondary hidden" id="bj-double">DOUBLE</button>
        </div>
      </div>

      <div class="bj-hud-row muted" id="bj-hud"></div>
    </section>
  `;

  let currentBet  = DEFAULT_BET;
  let gameState   = null;
  let phase       = 'IDLE';
  let lockTimer   = null;
  let unsubWallet = null;

  const dealBtn    = document.getElementById('bj-deal');
  const hitBtn     = document.getElementById('bj-hit');
  const standBtn   = document.getElementById('bj-stand');
  const doubleBtn  = document.getElementById('bj-double');
  const betDec     = document.getElementById('bj-bet-dec');
  const betInc     = document.getElementById('bj-bet-inc');
  const betValueEl = document.getElementById('bj-bet-value');
  const resultEl   = document.getElementById('bj-result');
  const resultText = document.getElementById('bj-result-text');
  const lockBanner = document.getElementById('bj-lockout');
  const lockMsg    = document.getElementById('bj-lockout-msg');
  const hudEl      = document.getElementById('bj-hud');
  const playerCards = document.getElementById('player-cards');
  const dealerCards = document.getElementById('dealer-cards');
  const playerValueEl = document.getElementById('player-value');
  const dealerValueEl = document.getElementById('dealer-value');

  function makeCard(card, faceDown = false) {
    const el = document.createElement('div');
    el.className = `playing-card${faceDown ? ' face-down' : ''}${!faceDown && RED_SUITS.has(card.suit) ? ' red' : ''}`;
    if (!faceDown) el.innerHTML = `
      <div class="card-corner top-left">${card.rank}<br><span>${card.suit}</span></div>
      <div class="card-suit-center">${card.suit}</div>
      <div class="card-corner bottom-right">${card.rank}<br><span>${card.suit}</span></div>`;
    return el;
  }

  function appendCard(card, zone, faceDown = false) {
    const el = makeCard(card, faceDown);
    el.style.cssText = 'opacity:0;transform:translateY(-20px)';
    zone.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .25s ease-out, transform .25s ease-out';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    return el;
  }

  function flipHoleCard() {
    const faceDownEl = dealerCards.querySelector('.face-down');
    if (!faceDownEl) return;
    faceDownEl.style.transition = 'transform .3s ease-in-out';
    faceDownEl.style.transform = 'rotateY(90deg)';
    setTimeout(() => {
      const card = gameState.dealerHand[1];
      faceDownEl.className = `playing-card${RED_SUITS.has(card.suit) ? ' red' : ''}`;
      faceDownEl.innerHTML = `
        <div class="card-corner top-left">${card.rank}<br><span>${card.suit}</span></div>
        <div class="card-suit-center">${card.suit}</div>
        <div class="card-corner bottom-right">${card.rank}<br><span>${card.suit}</span></div>`;
      faceDownEl.style.transform = 'rotateY(0deg)';
    }, FLIP_DELAY);
  }

  function clearTable() {
    playerCards.innerHTML = dealerCards.innerHTML = '';
    playerValueEl.textContent = dealerValueEl.textContent = '';
    resultEl.classList.add('hidden');
  }

  function updateValues() {
    if (!gameState) return;
    const pv = handValue(gameState.playerHand);
    playerValueEl.textContent = `(${pv.value}${pv.soft ? ' soft' : ''})`;
    if (phase === 'RESULT') {
      dealerValueEl.textContent = `(${handValue(gameState.dealerHand).value})`;
    } else {
      dealerValueEl.textContent = `(${handValue([gameState.dealerHand[0]]).value} + ?)`;
    }
  }

  function refreshHUD() {
    if (!gameState || phase === 'IDLE') { hudEl.textContent = 'Deal to see odds.'; return; }
    const o = getBlackjackOdds(gameState.playerHand, gameState.dealerHand[0], gameState.deckState);
    hudEl.innerHTML = `Bust risk: <strong>${(o.bustRisk*100).toFixed(1)}%</strong>  ·  Dealer bust: <strong>${(o.dealerBustChance*100).toFixed(1)}%</strong>  ·  Win if stand: <strong>${(o.winIfStand*100).toFixed(1)}%</strong>  ·  Suggested: <strong style="color:var(--gold)">${o.recommendedAction}</strong>`;
    window.dispatchEvent(new CustomEvent('voyanabet:hud', { detail: { type: 'blackjack', data: o } }));
  }

  function setPhase(p) {
    phase = p;
    [dealBtn, hitBtn, standBtn, doubleBtn].forEach(b => b.classList.add('hidden'));
    betDec.disabled = betInc.disabled = p !== 'IDLE';
    if (p === 'IDLE') {
      dealBtn.classList.remove('hidden');
      dealBtn.disabled = isLocked() || getBalance() < currentBet;
    } else if (p === 'PLAYER_TURN') {
      hitBtn.classList.remove('hidden');
      standBtn.classList.remove('hidden');
      doubleBtn.classList.remove('hidden');
      doubleBtn.disabled = getBalance() < currentBet;
    }
    updateBetDisplay();
  }

  function updateBetDisplay() {
    betValueEl.textContent = currentBet;
    betDec.disabled = phase !== 'IDLE' || currentBet <= MIN_BET;
    betInc.disabled = phase !== 'IDLE' || currentBet >= MAX_BET || currentBet + BET_STEP > getBalance();
    if (phase === 'IDLE') dealBtn.disabled = isLocked() || getBalance() < currentBet;
  }

  betDec.addEventListener('click', () => { currentBet = Math.max(MIN_BET, currentBet - BET_STEP); updateBetDisplay(); });
  betInc.addEventListener('click', () => { currentBet = Math.min(MAX_BET, currentBet + BET_STEP); updateBetDisplay(); });
  unsubWallet = onBalanceChange(() => updateBetDisplay());

  function checkLockout() {
    if (!isLocked()) {
      lockBanner.classList.add('hidden');
      if (lockTimer) { clearInterval(lockTimer); lockTimer = null; }
      return false;
    }
    lockBanner.classList.remove('hidden');
    lockMsg.textContent = `COOLING OFF — ${getLockoutRemaining()}s`;
    if (!lockTimer) {
      lockTimer = setInterval(() => {
        if (!isLocked()) {
          clearInterval(lockTimer); lockTimer = null;
          lockBanner.classList.add('hidden');
          setPhase('IDLE');
          window.dispatchEvent(new Event('voyanabet:open-chart'));
        } else {
          lockMsg.textContent = `COOLING OFF — ${getLockoutRemaining()}s`;
        }
      }, LOCKOUT_POLL);
    }
    return true;
  }

  dealBtn.addEventListener('click', async () => {
    if (checkLockout() || phase !== 'IDLE' || getBalance() < currentBet) return;
    clearTable();
    setPhase('DEALING');
    updateWallet(-currentBet);

    const { playerHand, dealerHand, deckState } = await dealWithSuspense(({ card, to, index, faceDown }) => {
      appendCard(card, to === 'player' ? playerCards : dealerCards, faceDown);
    });

    gameState = { playerHand, dealerHand, deckState };
    updateValues();

    if (handValue(playerHand).value === 21) { await resolveRound(playerHand, dealerHand, deckState, currentBet); return; }
    setPhase('PLAYER_TURN');
    refreshHUD();
  });

  hitBtn.addEventListener('click', () => {
    if (phase !== 'PLAYER_TURN') return;
    const res = hit(gameState.playerHand, gameState.deckState);
    appendCard(res.hand.at(-1), playerCards);
    gameState.playerHand = res.hand;
    gameState.deckState  = res.deckState;
    updateValues();
    if (res.isBust) { setPhase('RESULT'); finalizeRound('BUST', currentBet, 0); return; }
    refreshHUD();
  });

  standBtn.addEventListener('click', async () => {
    if (phase !== 'PLAYER_TURN') return;
    await resolveRound(gameState.playerHand, gameState.dealerHand, gameState.deckState, currentBet);
  });

  doubleBtn.addEventListener('click', async () => {
    if (phase !== 'PLAYER_TURN' || getBalance() < currentBet) return;
    const doubleBet = currentBet * 2;
    updateWallet(-currentBet);
    const res = hit(gameState.playerHand, gameState.deckState);
    appendCard(res.hand.at(-1), playerCards);
    gameState.playerHand = res.hand;
    gameState.deckState  = res.deckState;
    updateValues();
    if (res.isBust) { finalizeRound('BUST', doubleBet, 0); return; }
    await resolveRound(res.hand, gameState.dealerHand, res.deckState, doubleBet);
  });

  async function resolveRound(playerHand, dealerHand, deckState, betAmount) {
    setPhase('DEALER_TURN');
    const res = stand(playerHand, dealerHand, deckState, betAmount);
    gameState.dealerHand = res.dealerHand;
    gameState.deckState  = res.deckState;

    flipHoleCard();

    for (let i = 2; i < res.dealerHand.length; i++) {
      await new Promise(r => setTimeout(r, 400));
      if (!dealerCards.children[i]) appendCard(res.dealerHand[i], dealerCards);
    }

    await new Promise(r => setTimeout(r, 350));
    setPhase('RESULT');
    updateValues();
    finalizeRound(res.outcome, betAmount, res.payout);
  }

  function finalizeRound(outcome, betAmount, netDelta) {
    const returned = { BLACKJACK: betAmount + Math.floor(betAmount * 1.5), WIN: betAmount * 2, PUSH: betAmount, LOSS: 0, BUST: 0 }[outcome] ?? 0;
    if (returned > 0) updateWallet(returned);
    recordResult(betAmount, returned);

    const justLocked = isLocked();
    if (justLocked) {
      postLockoutEvent({ lockedAt: Date.now(), reason: 'loss_threshold' });
      window.dispatchEvent(new Event('voyanabet:open-chart'));
    }

    postRound({ game: 'blackjack', bet: betAmount, payout: returned, outcome, timestamp: Date.now() });

    const banners = { BLACKJACK: `✦ BLACKJACK! +${Math.floor(betAmount*1.5)}`, WIN: `WIN +${betAmount}`, PUSH: `PUSH — bet returned`, LOSS: `LOSS −${betAmount}`, BUST: `BUST −${betAmount}` };
    const types   = { WIN: 'win', BLACKJACK: 'jackpot', PUSH: 'push', LOSS: 'loss', BUST: 'loss' };
    resultText.textContent = banners[outcome] ?? outcome;
    resultEl.className = `result-banner result-${types[outcome] ?? 'loss'}`;

    if (outcome === 'BLACKJACK') {
      document.querySelector('.blackjack-screen')?.classList.add('blackjack-burst');
      setTimeout(() => document.querySelector('.blackjack-screen')?.classList.remove('blackjack-burst'), 1800);
    }

    setTimeout(() => { justLocked ? checkLockout() : setPhase('IDLE'); }, 1200);
  }

  updateBetDisplay();
  setPhase('IDLE');
  checkLockout();

  new MutationObserver(() => {
    if (!document.getElementById('bj-deal')) {
      if (lockTimer) clearInterval(lockTimer);
      unsubWallet?.();
    }
  }).observe(document.getElementById('game-view') ?? document.body, { childList: true });
}
