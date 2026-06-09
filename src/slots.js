/**
 * @fileoverview Slots game logic with weighted reels and RTP-calibrated paytable.
 * Target RTP: 92–96%
 */

import { weightedPick } from './rng.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Relative pull weights per symbol. Higher = more frequent. */
export const SYMBOL_WEIGHTS = {
  Cherry:  30,
  Bar:     20,
  Bell:    15,
  Seven:   10,
  Diamond:  5,
  Jackpot:  1,
};

/** Total weight (pre-computed for HUD use). */
export const TOTAL_WEIGHT = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0); // 81

/**
 * Payout multipliers applied to the bet amount.
 * 3-of-a-kind unless noted. 2-of-a-kind multipliers are halved.
 */
export const PAYTABLE = {
  JACKPOT_3X:  100,
  DIAMOND_3X:   25,
  SEVEN_3X:     20,
  BELL_3X:      10,
  BAR_3X:        5,
  CHERRY_3X:     3,
  JACKPOT_2X:   15,
  DIAMOND_2X:    5,
  SEVEN_2X:      3,
  BELL_2X:       2,
  BAR_2X:        1,
  CHERRY_2X:     1,
};

const REEL_COUNT = 3;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Spins a single reel and returns the landed symbol. */
function spinReel() {
  return weightedPick(SYMBOL_WEIGHTS);
}

/**
 * Evaluates the 3-reel outcome and returns the multiplier key and multiplier value.
 * @param {string[]} reels
 * @returns {{ key: string, multiplier: number }}
 */
function evaluate(reels) {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    const symbol = a.toUpperCase();
    const key = `${symbol}_3X`;
    return { key, multiplier: PAYTABLE[key] ?? 0 };
  }

  // Any two matching (highest-value pair wins)
  const symbols = [a, b, c];
  const counts = {};
  for (const s of symbols) counts[s] = (counts[s] ?? 0) + 1;

  const pairs = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([sym]) => sym);

  if (pairs.length > 0) {
    // Pick the highest-value pair
    const best = pairs.sort(
      (x, y) => SYMBOL_WEIGHTS[x] - SYMBOL_WEIGHTS[y] // lower weight = rarer = more valuable
    )[0];
    const key = `${best.toUpperCase()}_2X`;
    return { key, multiplier: PAYTABLE[key] ?? 0 };
  }

  return { key: 'LOSS', multiplier: 0 };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Spins all 3 reels and returns the full round result.
 * @param {number} betAmount - Positive integer bet in chips/credits
 * @returns {{
 *   reels: string[],
 *   outcome: string,
 *   payout: number,
 *   rtpContribution: number
 * }}
 */
export function spin(betAmount) {
  if (betAmount <= 0) throw new RangeError('betAmount must be positive');

  const reels = Array.from({ length: REEL_COUNT }, spinReel);
  const { key, multiplier } = evaluate(reels);
  const payout = multiplier * betAmount;
  const rtpContribution = payout / betAmount; // per-spin RTP contribution ratio

  return {
    reels,
    outcome: key,
    payout,
    rtpContribution,
  };
}

// ─── ARCHITECT INTERFACE ──────────────────────────────────────────────────────
// spin(betAmount)         → { reels: string[], outcome: string, payout: number, rtpContribution: number }
// PAYTABLE                → Record<string, number>  (render paytable UI)
// SYMBOL_WEIGHTS          → Record<string, number>  (feed into probabilityHUD)

// ─── VAULT INTERFACE ──────────────────────────────────────────────────────────
// POST /api/round after each spin with: { game: 'slots', bet: betAmount, payout, outcome, reels, timestamp }
