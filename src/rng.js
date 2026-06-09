/**
 * @fileoverview Centralized cryptographically-secure RNG module.
 * All game modules must import from here — no Math.random() elsewhere.
 */

import { randomInt, randomBytes } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLOAT_PRECISION = 2 ** 32; // 32-bit resolution for uniform float

// ─── Core RNG ─────────────────────────────────────────────────────────────────

/**
 * Returns a cryptographically-secure random integer in [min, max] inclusive.
 * @param {number} min - Lower bound (integer)
 * @param {number} max - Upper bound (integer, inclusive)
 * @returns {number}
 */
export function getRandomInt(min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new TypeError('min and max must be integers');
  }
  if (min > max) throw new RangeError('min must be <= max');
  if (min === max) return min;
  // crypto.randomInt upper bound is exclusive
  return randomInt(min, max + 1);
}

/**
 * Returns a cryptographically-secure random float in [0, 1).
 * @returns {number}
 */
export function getRandomFloat() {
  const buf = randomBytes(4);
  const uint32 = buf.readUInt32BE(0);
  return uint32 / FLOAT_PRECISION;
}

/**
 * Fisher-Yates in-place shuffle using crypto RNG.
 * Returns the same array reference for convenience.
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = getRandomInt(0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Picks a single item from a weighted map using the crypto RNG.
 * @param {Record<string, number>} weights - { item: weight } where higher weight = more likely
 * @returns {string} The selected item key
 */
export function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = getRandomFloat() * total;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) return item;
  }
  // Floating-point edge: return last item
  return entries[entries.length - 1][0];
}

// ─── ARCHITECT INTERFACE ──────────────────────────────────────────────────────
// Exports: getRandomInt, getRandomFloat, shuffle, weightedPick
// No UI surface — consumed by other game modules only.

// ─── VAULT INTERFACE ──────────────────────────────────────────────────────────
// No direct vault interaction — RNG is local only. Seed data not exposed.
