import { shuffle } from './rng.js';

const NUM_DECKS = 6;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit });
  return deck;
}

function buildShoe() {
  const shoe = [];
  for (let i = 0; i < NUM_DECKS; i++) shoe.push(...buildDeck());
  return shuffle(shoe);
}

function rankValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

export function handValue(hand) {
  let total = 0, aces = 0;
  for (const card of hand) {
    total += rankValue(card.rank);
    if (card.rank === 'A') aces++;
  }
  // ace flips from 11 to 1 when needed
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { value: total, soft: aces > 0 };
}

function drawCard(shoe) {
  if (shoe.length === 0) throw new Error('Shoe is empty');
  const [card, ...rest] = shoe;
  return [card, rest];
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand).value === 21;
}

export function deal() {
  let shoe = buildShoe();
  let p1, d1, p2, d2;
  [p1, shoe] = drawCard(shoe);
  [d1, shoe] = drawCard(shoe);
  [p2, shoe] = drawCard(shoe);
  [d2, shoe] = drawCard(shoe);
  return {
    playerHand: [p1, p2],
    dealerHand: [d1, d2],
    deckState: { shoe, cardsRemaining: shoe.length },
  };
}

export function hit(hand, deckState) {
  let [card, newShoe] = drawCard(deckState.shoe);
  const newHand = [...hand, card];
  const { value } = handValue(newHand);
  return {
    hand: newHand,
    isBust: value > 21,
    handValue: value,
    deckState: { shoe: newShoe, cardsRemaining: newShoe.length },
  };
}

export function stand(playerHand, dealerHand, deckState, betAmount) {
  let shoe = deckState.shoe;
  let dHand = [...dealerHand];

  while (true) {
    const { value, soft } = handValue(dHand);
    // stand on soft 17
    if (value > 17 || value === 17) break;
    let card;
    [card, shoe] = drawCard(shoe);
    dHand.push(card);
  }

  const pv = handValue(playerHand).value;
  const dv = handValue(dHand).value;
  const pBJ = isBlackjack(playerHand);
  const dBJ = isBlackjack(dHand);

  let outcome, multiplier;
  if (pBJ && dBJ)       { outcome = 'PUSH';      multiplier = 0; }
  else if (pBJ)          { outcome = 'BLACKJACK'; multiplier = 1.5; }
  else if (dBJ)          { outcome = 'LOSS';      multiplier = -1; }
  else if (dv > 21)      { outcome = 'WIN';       multiplier = 1; }
  else if (pv > dv)      { outcome = 'WIN';       multiplier = 1; }
  else if (pv === dv)    { outcome = 'PUSH';      multiplier = 0; }
  else                   { outcome = 'LOSS';      multiplier = -1; }

  return {
    dealerHand: dHand,
    outcome,
    payout: betAmount * multiplier,
    deckState: { shoe, cardsRemaining: shoe.length },
  };
}
