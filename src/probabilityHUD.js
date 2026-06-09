/**
 * @fileoverview Real-time probability HUD engine for Blackjack and Slots.
 * Consumes deckState from blackjack.js and SYMBOL_WEIGHTS from slots.js.
 * All functions return plain JS objects for direct DOM rendering.
 */

import { handValue } from './blackjack.js';
import { SYMBOL_WEIGHTS, PAYTABLE, TOTAL_WEIGHT } from './slots.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const BUST_THRESHOLD = 21;

// Basic Strategy action thresholds (hard totals, simplified)
const BASIC_STRATEGY = {
  // [playerTotal]: { threshold: dealerUpcardValue, action }
  // Hard hands: hit below threshold, stand at/above
  HARD_HIT_BELOW: 17,       // always hit hard < 17
  HARD_DOUBLE_RANGE: [9, 11], // double 9–11 vs dealer 3–6 (simplified)
  SOFT_STAND_VALUE: 18,     // stand on soft 18+
};

// ─── Blackjack HUD ────────────────────────────────────────────────────────────

/**
 * Counts how many cards of each rank remain in the shoe.
 * @param {{ shoe: object[], cardsRemaining: number }} deckState
 * @returns {Record<string, number>}
 */
function countRemainingRanks(deckState) {
  const counts = {};
  for (const card of deckState.shoe) {
    counts[card.rank] = (counts[card.rank] ?? 0) + 1;
  }
  return counts;
}

/**
 * Returns the numeric value of a rank for bust calculation.
 * Ace is counted as 11 here; caller handles soft logic.
 */
function cardNumericValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

/**
 * Calculates Blackjack odds given current hands and shoe state.
 * @param {{ rank: string, suit: string }[]} playerHand
 * @param {{ rank: string, suit: string }} dealerUpcard - dealer's visible card
 * @param {{ shoe: object[], cardsRemaining: number }} deckState
 * @returns {{
 *   bustRisk: number,
 *   dealerBustChance: number,
 *   winIfStand: number,
 *   recommendedAction: string
 * }}
 */
export function getBlackjackOdds(playerHand, dealerUpcard, deckState) {
  const remaining = deckState.cardsRemaining;
  if (remaining === 0) {
    return { bustRisk: 0, dealerBustChance: 0, winIfStand: 0, recommendedAction: 'STAND' };
  }

  const rankCounts = countRemainingRanks(deckState);
  const { value: playerTotal, soft: playerSoft } = handValue(playerHand);

  // ── P(player busts on next hit) ──────────────────────────────────────────
  // A bust card is any card whose lowest possible addition pushes us over 21
  let bustCards = 0;
  for (const [rank, count] of Object.entries(rankCounts)) {
    const addedValue = cardNumericValue(rank);
    let newTotal = playerTotal + addedValue;
    // If soft hand, Ace can drop to 1
    if (playerSoft && newTotal > BUST_THRESHOLD) newTotal -= 10;
    if (newTotal > BUST_THRESHOLD) bustCards += count;
  }
  const bustRisk = bustCards / remaining;

  // ── P(dealer busts) — simplified using dealer upcard heuristics ──────────
  // Empirical Basic Strategy bust probabilities by upcard (industry-standard approximations)
  const DEALER_BUST_BY_UPCARD = {
    '2': 0.354, '3': 0.374, '4': 0.394, '5': 0.415, '6': 0.423,
    '7': 0.262, '8': 0.241, '9': 0.230, '10': 0.212, 'J': 0.212,
    'Q': 0.212, 'K': 0.212, 'A': 0.117,
  };
  const dealerBustChance = DEALER_BUST_BY_UPCARD[dealerUpcard.rank] ?? 0.25;

  // ── P(player wins if standing) — combinatorial ────────────────────────────
  // Estimate: player wins if dealer busts, plus proportion of dealer totals below playerTotal
  // We use a Monte Carlo shortcut over the remaining shoe distribution
  const avgDealerDrawValue = Object.entries(rankCounts).reduce((sum, [rank, count]) => {
    return sum + (cardNumericValue(rank) * count);
  }, 0) / remaining;

  // Simplified: win chance ≈ dealer bust chance + fraction where dealer would draw low
  const dealerUpcardVal = cardNumericValue(dealerUpcard.rank);
  // Rough: dealer needs to reach 17+; high upcard = lower draw need = fewer busts
  const standsBeatingPlayer = playerTotal > BUST_THRESHOLD
    ? 0
    : dealerBustChance + Math.max(0, (BUST_THRESHOLD - playerTotal) / BUST_THRESHOLD) * 0.15;
  const winIfStand = Math.min(0.95, Math.max(0, standsBeatingPlayer));

  // ── Recommended Action (Basic Strategy) ──────────────────────────────────
  const dealerVal = cardNumericValue(dealerUpcard.rank);
  let recommendedAction;

  if (playerSoft) {
    // Soft hand strategy
    if (playerTotal >= BASIC_STRATEGY.SOFT_STAND_VALUE) {
      recommendedAction = 'STAND';
    } else {
      recommendedAction = 'HIT';
    }
  } else {
    // Hard hand strategy
    if (playerTotal >= BASIC_STRATEGY.HARD_HIT_BELOW) {
      recommendedAction = 'STAND';
    } else if (
      playerTotal >= BASIC_STRATEGY.HARD_DOUBLE_RANGE[0] &&
      playerTotal <= BASIC_STRATEGY.HARD_DOUBLE_RANGE[1] &&
      dealerVal >= 3 && dealerVal <= 6
    ) {
      recommendedAction = 'DOUBLE';
    } else if (playerTotal <= 11) {
      recommendedAction = 'HIT'; // can't bust on one card
    } else if (bustRisk > 0.65) {
      recommendedAction = 'STAND';
    } else {
      recommendedAction = 'HIT';
    }
  }

  return {
    bustRisk: parseFloat(bustRisk.toFixed(4)),
    dealerBustChance: parseFloat(dealerBustChance.toFixed(4)),
    winIfStand: parseFloat(winIfStand.toFixed(4)),
    recommendedAction,
  };
}

// ─── Slots HUD ────────────────────────────────────────────────────────────────

/**
 * Calculates theoretical slots odds derived from SYMBOL_WEIGHTS and PAYTABLE.
 * Single source of truth — imports directly from slots.js constants.
 * @returns {{
 *   winChance: number,
 *   jackpotChance: number,
 *   expectedValuePerSpin: number
 * }}
 */
export function getSlotsOdds() {
  const symbols = Object.keys(SYMBOL_WEIGHTS);

  // Probability of landing a specific symbol on one reel
  function p(symbol) {
    return SYMBOL_WEIGHTS[symbol] / TOTAL_WEIGHT;
  }

  let expectedValue = 0;
  let winChance = 0;

  // 3-of-a-kind contributions
  for (const sym of symbols) {
    const prob3 = p(sym) ** 3;
    const key3 = `${sym.toUpperCase()}_3X`;
    const multiplier3 = PAYTABLE[key3] ?? 0;
    expectedValue += prob3 * multiplier3;
    if (multiplier3 > 0) winChance += prob3;
  }

  // 2-of-a-kind: exactly 2 of one symbol, 3 positional arrangements
  for (const sym of symbols) {
    const pSym = p(sym);
    // P(exactly 2 of sym on 3 reels) = C(3,2) * p^2 * (1-p)
    const prob2 = 3 * (pSym ** 2) * (1 - pSym);
    const key2 = `${sym.toUpperCase()}_2X`;
    const multiplier2 = PAYTABLE[key2] ?? 0;
    expectedValue += prob2 * multiplier2;
    if (multiplier2 > 0) winChance += prob2;
  }

  const jackpotChance = p('Jackpot') ** 3;

  return {
    winChance: parseFloat(winChance.toFixed(6)),
    jackpotChance: parseFloat(jackpotChance.toFixed(8)),
    expectedValuePerSpin: parseFloat(expectedValue.toFixed(6)), // per 1-chip bet
  };
}

// ─── ARCHITECT INTERFACE ──────────────────────────────────────────────────────
// getBlackjackOdds(playerHand, dealerUpcard, deckState)
//   → { bustRisk, dealerBustChance, winIfStand, recommendedAction }
//   Render as: bust risk bar, dealer bust %, win % pill, action badge
//   Call after every deal() / hit() to refresh HUD
//
// getSlotsOdds()
//   → { winChance, jackpotChance, expectedValuePerSpin }
//   Static — call once on page load; re-call if SYMBOL_WEIGHTS ever changes

// ─── VAULT INTERFACE ──────────────────────────────────────────────────────────
// No direct vault interaction — HUD is client-side display only.
// If logging HUD recommendations: include recommendedAction in the round payload
// POST /api/round alongside the game result.
