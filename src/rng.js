// Uses Web Crypto API (browser + Node 19+). No Node-specific imports needed.

export function getRandomInt(min, max) {
  if (min === max) return min;
  const range = max - min + 1;
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  // rejection sampling to avoid modulo bias
  const maxValid = Math.floor(0x100000000 / range) * range;
  let n = arr[0];
  while (n >= maxValid) {
    globalThis.crypto.getRandomValues(arr);
    n = arr[0];
  }
  return min + (n % range);
}

export function getRandomFloat() {
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return arr[0] / 0x100000000;
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
