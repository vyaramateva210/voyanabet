import { spinWithSuspense } from './suspense.js';
import { getSlotsOdds } from './probabilityHUD.js';
import { recordResult, isLocked, getLockoutRemaining } from './responsibleGambling.js';
import { getBalance, updateWallet, onBalanceChange } from './wallet.js';
import { postRound, postLockoutEvent } from './api_client.js';

const MIN_BET     = 5;
const MAX_BET     = 500;
const DEFAULT_BET = 25;
const BET_STEP    = 5;
const TICKER_MS   = 75;
const LOCKOUT_POLL = 500;

const GLYPHS = {
  Cherry: '🍒', Bar: 'BAR', Bell: '🔔',
  Seven:  '7',  Diamond: '◆', Jackpot: '✦',
};

const GLYPH_COLORS = {
  Cherry: '#ef4444', Bar: '#9ca3af', Bell: '#f5c842',
  Seven:  '#ef4444', Diamond: '#38bdf8', Jackpot: '#f5c842',
};

const ALL_SYMBOLS = Object.keys(GLYPHS);

export function render(container) {
  container.innerHTML = `
    <section class="slots-screen">
      <div class="game-header">
        <h2 class="game-title">Slots</h2>
        <p class="game-subtitle muted">Weighted reels · Target RTP 92–96%</p>
      </div>

      <div class="lockout-banner hidden" id="slots-lockout">
        <span>⚠</span>
        <span id="slots-lockout-msg">COOLING OFF</span>
      </div>

      <div class="reels-container">
        ${[0,1,2].map(i => `
          <div class="reel" id="reel-${i}">
            <div class="reel-frame">
              <span class="reel-symbol" style="color:${Object.values(GLYPH_COLORS)[i]}">${Object.values(GLYPHS)[i]}</span>
            </div>
          </div>`).join('')}
      </div>

      <div class="bet-controls">
        <button class="btn btn-ghost bet-btn" id="slots-bet-dec">−</button>
        <div class="bet-display">⬡ <span id="slots-bet-value">${DEFAULT_BET}</span></div>
        <button class="btn btn-ghost bet-btn" id="slots-bet-inc">+</button>
      </div>

      <button class="btn btn-primary spin-btn" id="slots-spin-btn">
        <span id="slots-spin-label">SPIN</span>
      </button>

      <div class="result-banner hidden" id="slots-result">
        <span id="slots-result-text"></span>
      </div>

      <div class="slots-hud-row muted" id="slots-hud-row"></div>
    </section>
  `;

  let currentBet  = DEFAULT_BET;
  let isSpinning  = false;
  let lockTimer   = null;
  let unsubWallet = null;

  const spinBtn    = document.getElementById('slots-spin-btn');
  const spinLabel  = document.getElementById('slots-spin-label');
  const betValueEl = document.getElementById('slots-bet-value');
  const betDec     = document.getElementById('slots-bet-dec');
  const betInc     = document.getElementById('slots-bet-inc');
  const result     = document.getElementById('slots-result');
  const resultText = document.getElementById('slots-result-text');
  const lockBanner = document.getElementById('slots-lockout');
  const lockMsg    = document.getElementById('slots-lockout-msg');
  const hudRow     = document.getElementById('slots-hud-row');
  const reelEls    = [0,1,2].map(i => document.getElementById(`reel-${i}`));

  function refreshHUD() {
    const o = getSlotsOdds();
    hudRow.textContent = `Win: ${(o.winChance*100).toFixed(2)}%  ·  Jackpot: ${(o.jackpotChance*100).toFixed(4)}%  ·  EV: ${o.expectedValuePerSpin.toFixed(4)}`;
    window.dispatchEvent(new CustomEvent('voyanabet:hud', { detail: { type: 'slots', data: o } }));
  }
  refreshHUD();

  function updateBetDisplay() {
    betValueEl.textContent = currentBet;
    betDec.disabled = currentBet <= MIN_BET || isSpinning;
    betInc.disabled = currentBet >= MAX_BET || isSpinning || currentBet + BET_STEP > getBalance();
  }

  betDec.addEventListener('click', () => { currentBet = Math.max(MIN_BET, currentBet - BET_STEP); updateBetDisplay(); });
  betInc.addEventListener('click', () => { currentBet = Math.min(MAX_BET, currentBet + BET_STEP); updateBetDisplay(); });
  unsubWallet = onBalanceChange(() => updateBetDisplay());

  function checkLockout() {
    if (!isLocked()) {
      lockBanner.classList.add('hidden');
      spinBtn.disabled = isSpinning;
      if (lockTimer) { clearInterval(lockTimer); lockTimer = null; }
      return false;
    }
    lockBanner.classList.remove('hidden');
    spinBtn.disabled = true;
    lockMsg.textContent = `COOLING OFF — ${getLockoutRemaining()}s`;
    if (!lockTimer) {
      lockTimer = setInterval(() => {
        if (!isLocked()) {
          clearInterval(lockTimer); lockTimer = null;
          lockBanner.classList.add('hidden');
          spinBtn.disabled = false;
          updateBetDisplay();
          window.dispatchEvent(new Event('voyanabet:open-chart'));
        } else {
          lockMsg.textContent = `COOLING OFF — ${getLockoutRemaining()}s`;
        }
      }, LOCKOUT_POLL);
    }
    return true;
  }

  function createTicker(reelEl) {
    const symEl = reelEl.querySelector('.reel-symbol');
    let idx = 0, id = null;
    return {
      start() {
        reelEl.classList.add('spinning');
        id = setInterval(() => {
          idx = (idx + 1) % ALL_SYMBOLS.length;
          const s = ALL_SYMBOLS[idx];
          symEl.textContent = GLYPHS[s];
          symEl.style.color = GLYPH_COLORS[s];
        }, TICKER_MS);
      },
      stop(symbol) {
        clearInterval(id);
        reelEl.classList.remove('spinning');
        symEl.textContent = GLYPHS[symbol];
        symEl.style.color = GLYPH_COLORS[symbol];
        reelEl.classList.add('landed');
        setTimeout(() => reelEl.classList.remove('landed'), 500);
      },
    };
  }

  spinBtn.addEventListener('click', async () => {
    if (isSpinning || checkLockout()) return;
    if (getBalance() < currentBet) { showResult(`Need ${currentBet} chips`, 'loss'); return; }

    isSpinning = true;
    spinBtn.disabled = true;
    spinLabel.textContent = 'SPINNING…';
    result.classList.add('hidden');
    betDec.disabled = betInc.disabled = true;

    updateWallet(-currentBet);

    const tickers = reelEls.map(createTicker);
    tickers.forEach(t => t.start());

    let spinResult;
    try {
      spinResult = await spinWithSuspense(currentBet, (i, sym) => tickers[i].stop(sym));
    } catch (err) {
      console.error(err);
      tickers.forEach(t => t.stop('Bar'));
      isSpinning = false; spinBtn.disabled = false; spinLabel.textContent = 'SPIN';
      return;
    }

    if (spinResult.payout > 0) updateWallet(spinResult.payout);
    recordResult(currentBet, spinResult.payout);

    const justLocked = isLocked();
    if (justLocked) {
      postLockoutEvent({ lockedAt: Date.now(), reason: 'loss_threshold' });
      window.dispatchEvent(new Event('voyanabet:open-chart'));
    }

    postRound({ game: 'slots', bet: currentBet, payout: spinResult.payout, outcome: spinResult.outcome, timestamp: Date.now() });
    refreshHUD();

    if (spinResult.outcome === 'LOSS') {
      showResult(`No match`, 'loss');
    } else if (spinResult.outcome.includes('JACKPOT_3X')) {
      document.querySelector('.slots-screen')?.classList.add('jackpot-burst');
      setTimeout(() => document.querySelector('.slots-screen')?.classList.remove('jackpot-burst'), 2000);
      showResult(`✦ JACKPOT! +${spinResult.payout}`, 'jackpot');
    } else {
      // win-glow on matching reels
      reelEls.forEach((el, i) => {
        const r = spinResult.reels;
        if (r.every(s => s === r[0]) || r.filter(s => s === r[i]).length >= 2) {
          el.classList.add('win-glow');
          setTimeout(() => el.classList.remove('win-glow'), 1600);
        }
      });
      showResult(`${spinResult.outcome.replace('_', ' ')} +${spinResult.payout}`, 'win');
    }

    isSpinning = false;
    spinLabel.textContent = 'SPIN';
    if (!justLocked) spinBtn.disabled = false;
    updateBetDisplay();
  });

  function showResult(text, type) {
    resultText.textContent = text;
    result.className = `result-banner result-${type}`;
  }

  updateBetDisplay();
  checkLockout();

  // cleanup on route change
  new MutationObserver(() => {
    if (!document.getElementById('slots-spin-btn')) {
      if (lockTimer) clearInterval(lockTimer);
      unsubWallet?.();
    }
  }).observe(document.getElementById('game-view') ?? document.body, { childList: true });
}
