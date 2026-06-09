/**
 * @fileoverview Demo runner — one full round of Slots and Blackjack with HUD output.
 * Run: node index.js
 */

import { spin } from './src/slots.js';
import { deal, hit, stand, handValue } from './src/blackjack.js';
import { recordResult, getSpendingSummary, isLocked, resetSession } from './src/responsibleGambling.js';
import { getBlackjackOdds, getSlotsOdds } from './src/probabilityHUD.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DEMO_BET = 10;
const DIVIDER = '─'.repeat(50);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handStr(hand) {
  return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
}

function log(label, value) {
  if (typeof value === 'object') {
    console.log(`  ${label}:`);
    for (const [k, v] of Object.entries(value)) {
      console.log(`    ${k}: ${v}`);
    }
  } else {
    console.log(`  ${label}: ${value}`);
  }
}

// ─── Slots Demo ───────────────────────────────────────────────────────────────

function demoSlots() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log('  SLOTS DEMO');
  console.log(`${'═'.repeat(50)}`);

  const slotsHUD = getSlotsOdds();
  console.log('\n[Slots HUD — Pre-spin]');
  log('Win chance', `${(slotsHUD.winChance * 100).toFixed(3)}%`);
  log('Jackpot chance', `${(slotsHUD.jackpotChance * 100).toFixed(5)}%`);
  log('EV per 1-chip bet', slotsHUD.expectedValuePerSpin.toFixed(4));

  const result = spin(DEMO_BET);

  console.log(`\n${DIVIDER}`);
  console.log('[Spin Result]');
  log('Reels', result.reels.join(' | '));
  log('Outcome', result.outcome);
  log('Payout', `${result.payout} chips`);
  log('Net', `${result.payout - DEMO_BET >= 0 ? '+' : ''}${result.payout - DEMO_BET} chips`);

  recordResult(DEMO_BET, result.payout);
}

// ─── Blackjack Demo ───────────────────────────────────────────────────────────

function demoBlackjack() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log('  BLACKJACK DEMO');
  console.log(`${'═'.repeat(50)}`);

  let { playerHand, dealerHand, deckState } = deal();

  const playerVal = handValue(playerHand);
  const dealerUpcard = dealerHand[0];

  console.log('\n[Initial Deal]');
  log('Player hand', handStr(playerHand));
  log('Player value', `${playerVal.value}${playerVal.soft ? ' (soft)' : ''}`);
  log('Dealer upcard', `${dealerUpcard.rank}${dealerUpcard.suit}`);
  log('Shoe remaining', deckState.cardsRemaining);

  const hudBefore = getBlackjackOdds(playerHand, dealerUpcard, deckState);
  console.log('\n[Probability HUD — Pre-decision]');
  log('Bust risk on hit', `${(hudBefore.bustRisk * 100).toFixed(1)}%`);
  log('Dealer bust chance', `${(hudBefore.dealerBustChance * 100).toFixed(1)}%`);
  log('Win if stand', `${(hudBefore.winIfStand * 100).toFixed(1)}%`);
  log('Recommended action', hudBefore.recommendedAction);

  // Follow the HUD recommendation for the demo
  let finalPlayerHand = playerHand;
  let finalDeckState = deckState;

  if (hudBefore.recommendedAction === 'HIT' || hudBefore.recommendedAction === 'DOUBLE') {
    console.log(`\n${DIVIDER}`);
    console.log('[Player Hits]');
    const hitResult = hit(playerHand, deckState);
    finalPlayerHand = hitResult.hand;
    finalDeckState = hitResult.deckState;
    log('New card', `${hitResult.hand[hitResult.hand.length - 1].rank}${hitResult.hand[hitResult.hand.length - 1].suit}`);
    log('New hand', handStr(finalPlayerHand));
    log('Value', hitResult.handValue);
    if (hitResult.isBust) {
      log('Result', 'BUST — Player loses');
      recordResult(DEMO_BET, 0);
      printSummary();
      return;
    }
  }

  console.log(`\n${DIVIDER}`);
  console.log('[Player Stands — Dealer Draws]');
  const standResult = stand(finalPlayerHand, dealerHand, finalDeckState, DEMO_BET);
  log('Dealer hand', handStr(standResult.dealerHand));
  log('Dealer value', handValue(standResult.dealerHand).value);
  log('Outcome', standResult.outcome);
  log('Payout', `${standResult.payout} chips`);
  log('Net', `${standResult.payout >= 0 ? '+' : ''}${standResult.payout} chips`);

  const actualPayout = standResult.outcome === 'LOSS' ? 0 : DEMO_BET + standResult.payout;
  recordResult(DEMO_BET, actualPayout);
}

// ─── Session Summary ──────────────────────────────────────────────────────────

function printSummary() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log('  SESSION SUMMARY');
  console.log(`${'═'.repeat(50)}`);
  const summary = getSpendingSummary();
  log('Rounds played', summary.roundsPlayed);
  log('Total wagered', `${summary.totalWagered} chips`);
  log('Total returned', `${summary.totalReturned} chips`);
  log('Net profit', `${summary.netProfit >= 0 ? '+' : ''}${summary.netProfit} chips`);
  log('Session RTP', `${summary.sessionRTP}%`);
  log('Locked out', isLocked() ? `Yes (${getLockoutRemaining()}s remaining)` : 'No');
  console.log();
}

// ─── Run ──────────────────────────────────────────────────────────────────────

resetSession();
demoSlots();
demoBlackjack();
printSummary();
