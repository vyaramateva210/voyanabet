import { randomInt, randomBytes } from 'crypto';

const FLOAT_PRECISION = 2 ** 32;

export function getRandomInt(min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max)) throw new TypeError('min and max must be integers');
  if (min > max) throw new RangeError('min must be <= max');
  if (min === max) return min;
  return randomInt(min, max + 1);
}

export function getRandomFloat() {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / FLOAT_PRECISION;
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = getRandomInt(0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function weightedPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = getRandomFloat() * total;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return entries[entries.length - 1][0];
}
