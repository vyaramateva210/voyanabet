import { handValue } from './blackjack.js';
import { SYMBOL_WEIGHTS, PAYTABLE, TOTAL_WEIGHT } from './slots.js';

// empirical dealer bust probabilities by upcard (industry approximations)
const DEALER_BUST = {
  '2':0.354,'3':0.374,'4':0.394,'5':0.415,'6':0.423,
  '7':0.262,'8':0.241,'9':0.230,'10':0.212,
  'J':0.212,'Q':0.212,'K':0.212,'A':0.117,
};

function rankNum(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

function countRanks(deckState) {
  const counts = {};
  for (const card of deckState.shoe) counts[card.rank] = (counts[card.rank] ?? 0) + 1;
  return counts;
}

export function getBlackjackOdds(playerHand, dealerUpcard, deckState) {
  const remaining = deckState.cardsRemaining;
  if (remaining === 0) return { bustRisk: 0, dealerBustChance: 0, winIfStand: 0, recommendedAction: 'STAND' };

  const rankCounts = countRanks(deckState);
  const { value: total, soft } = handValue(playerHand);

  let bustCards = 0;
  for (const [rank, count] of Object.entries(rankCounts)) {
    let newTotal = total + rankNum(rank);
    if (soft && newTotal > 21) newTotal -= 10;
    if (newTotal > 21) bustCards += count;
  }
  const bustRisk = bustCards / remaining;

  const dealerBustChance = DEALER_BUST[dealerUpcard.rank] ?? 0.25;

  // rough win-if-stand estimate
  const winIfStand = total > 21 ? 0 : Math.min(0.95, Math.max(0, dealerBustChance + (21 - total) / 21 * 0.15));

  const dv = rankNum(dealerUpcard.rank);
  let recommendedAction;
  if (soft) {
    recommendedAction = total >= 18 ? 'STAND' : 'HIT';
  } else if (total >= 17) {
    recommendedAction = 'STAND';
  } else if (total >= 9 && total <= 11 && dv >= 3 && dv <= 6) {
    recommendedAction = 'DOUBLE';
  } else if (total >= 13) {
    recommendedAction = dv <= 6 ? 'STAND' : 'HIT';
  } else if (bustRisk > 0.65) {
    recommendedAction = 'STAND';
  } else {
    recommendedAction = 'HIT';
  }

  return {
    bustRisk:        parseFloat(bustRisk.toFixed(4)),
    dealerBustChance: parseFloat(dealerBustChance.toFixed(4)),
    winIfStand:      parseFloat(winIfStand.toFixed(4)),
    recommendedAction,
  };
}

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
