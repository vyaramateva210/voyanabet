/**
 * @fileoverview Async suspense/timing utilities for animation hooks.
 * Drives staggered reel stops, card deal delays, and countdown timers.
 */

import { spin } from './slots.js';
import { deal, hit, handValue } from './blackjack.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const REEL_STOP_DELAYS_MS = [600, 1200, 1800]; // stagger per reel
const CARD_DEAL_DELAY_MS = 300;                // delay between each card
const COUNTDOWN_INTERVAL_MS = 1000;            // tick rate for countdown

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Resolves after `ms` milliseconds. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Spins the slots with staggered reel reveal timing.
 * Fires `onReelStop(reelIndex, symbol)` for each reel as it "stops."
 * @param {number} betAmount - Bet in chips/credits
 * @param {function(number, string): void} onReelStop - Animation hook per reel
 * @returns {Promise<{ reels: string[], outcome: string, payout: number, rtpContribution: number }>}
 */
export async function spinWithSuspense(betAmount, onReelStop) {
  const result = spin(betAmount);

  for (let i = 0; i < result.reels.length; i++) {
    await wait(REEL_STOP_DELAYS_MS[i] - (i > 0 ? REEL_STOP_DELAYS_MS[i - 1] : 0));
    if (typeof onReelStop === 'function') {
      onReelStop(i, result.reels[i]);
    }
  }

  return result;
}

/**
 * Deals cards with a per-card delay, firing `onCardDealt` after each reveal.
 * Returns the full deal result once all cards are shown.
 * @param {function({ card: object, to: string, index: number }): void} onCardDealt
 * @returns {Promise<{ playerHand: object[], dealerHand: object[], deckState: object }>}
 */
export async function dealWithSuspense(onCardDealt) {
  const result = deal();
  const { playerHand, dealerHand } = result;

  // Interleaved deal order: player, dealer, player, dealer (standard)
  const sequence = [
    { card: playerHand[0], to: 'player', index: 0 },
    { card: dealerHand[0], to: 'dealer', index: 0 },
    { card: playerHand[1], to: 'player', index: 1 },
    { card: dealerHand[1], to: 'dealer', index: 1, faceDown: true },
  ];

  for (const event of sequence) {
    await wait(CARD_DEAL_DELAY_MS);
    if (typeof onCardDealt === 'function') {
      onCardDealt(event);
    }
  }

  return result;
}

/**
 * Creates a countdown timer object.
 * Call `start()` to begin; `onTick(cb)` fires every second with seconds remaining.
 * `cancel()` stops the timer early.
 * @param {number} seconds - Total countdown duration
 * @returns {{ start: function, cancel: function, onTick: function(function(number): void): void }}
 */
export function createCountdown(seconds) {
  let intervalId = null;
  let tickCallback = null;
  let remaining = seconds;

  return {
    /**
     * Registers a callback fired on each tick with seconds remaining.
     * @param {function(number): void} cb
     */
    onTick(cb) {
      tickCallback = cb;
    },

    /** Starts the countdown. Stops automatically at 0. */
    start() {
      remaining = seconds;
      if (typeof tickCallback === 'function') tickCallback(remaining);

      intervalId = setInterval(() => {
        remaining--;
        if (typeof tickCallback === 'function') tickCallback(remaining);
        if (remaining <= 0) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, COUNTDOWN_INTERVAL_MS);
    },

    /** Cancels the countdown before it reaches 0. */
    cancel() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

// ─── ARCHITECT INTERFACE ──────────────────────────────────────────────────────
// spinWithSuspense(betAmount, onReelStop)  → Promise<spin result>
//   onReelStop(reelIndex: number, symbol: string) — wire to CSS animation triggers
// dealWithSuspense(onCardDealt)            → Promise<deal result>
//   onCardDealt({ card, to, index, faceDown? }) — wire to card flip animations
// createCountdown(seconds)                 → { start(), cancel(), onTick(cb) }
//   Use for lockout UI countdowns and bet timers

// ─── VAULT INTERFACE ──────────────────────────────────────────────────────────
// No vault interaction — suspense layer is UI timing only. Vault receives the
// underlying spin/deal results from slots.js and blackjack.js directly.
