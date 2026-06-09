import { weightedPick } from './rng.js';

export const SYMBOL_WEIGHTS = {
  Cherry:  30,
  Bar:     20,
  Bell:    15,
  Seven:   10,
  Diamond:  5,
  Jackpot:  1,
};

export const TOTAL_WEIGHT = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);

export const PAYTABLE = {
  JACKPOT_3X: 100,
  DIAMOND_3X:  25,
  SEVEN_3X:    20,
  BELL_3X:     10,
  BAR_3X:       5,
  CHERRY_3X:    3,
  JACKPOT_2X:  15,
  DIAMOND_2X:   5,
  SEVEN_2X:     3,
  BELL_2X:      2,
  BAR_2X:       1,
  CHERRY_2X:    1,
};

function spinReel() {
  return weightedPick(SYMBOL_WEIGHTS);
}

function evaluate(reels) {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    const key = `${a.toUpperCase()}_3X`;
    return { key, multiplier: PAYTABLE[key] ?? 0 };
  }

  const counts = {};
  for (const s of reels) counts[s] = (counts[s] ?? 0) + 1;

  const pairs = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([sym]) => sym);

  if (pairs.length > 0) {
    // lowest weight = rarest = highest value
    const best = pairs.sort((x, y) => SYMBOL_WEIGHTS[x] - SYMBOL_WEIGHTS[y])[0];
    const key = `${best.toUpperCase()}_2X`;
    return { key, multiplier: PAYTABLE[key] ?? 0 };
  }

  return { key: 'LOSS', multiplier: 0 };
}

export function spin(betAmount) {
  if (betAmount <= 0) throw new RangeError('betAmount must be positive');
  const reels = [spinReel(), spinReel(), spinReel()];
  const { key, multiplier } = evaluate(reels);
  const payout = multiplier * betAmount;
  return { reels, outcome: key, payout, rtpContribution: payout / betAmount };
}
