import { SYMBOL_WEIGHTS, PAYTABLE, TOTAL_WEIGHT } from './slots.js';

export function getSlotsOdds() {
  const symbols = Object.keys(SYMBOL_WEIGHTS);
  const p = sym => SYMBOL_WEIGHTS[sym] / TOTAL_WEIGHT;

  let expectedValue = 0, winChance = 0;

  for (const sym of symbols) {
    const prob3 = p(sym) ** 3;
    const key3  = `${sym.toUpperCase()}_3X`;
    const m3    = PAYTABLE[key3] ?? 0;
    expectedValue += prob3 * m3;
    if (m3 > 0) winChance += prob3;
  }

  for (const sym of symbols) {
    const pSym = p(sym);
    const prob2 = 3 * pSym ** 2 * (1 - pSym);
    const key2  = `${sym.toUpperCase()}_2X`;
    const m2    = PAYTABLE[key2] ?? 0;
    expectedValue += prob2 * m2;
    if (m2 > 0) winChance += prob2;
  }

  return {
    winChance:            parseFloat(winChance.toFixed(6)),
    jackpotChance:        parseFloat((p('Jackpot') ** 3).toFixed(8)),
    expectedValuePerSpin: parseFloat(expectedValue.toFixed(6)),
  };
}
