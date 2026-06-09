/**
 * @fileoverview Blackjack game logic — 6-deck shoe, Basic Strategy dealer rules.
 * deckState is exported after every action so probabilityHUD.js can consume it.
 */

import { shuffle } from './rng.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const NUM_DECKS = 6;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Chip payout ratios */
const PAYOUT = {
  BLACKJACK: 1.5,  // 3:2 net
  WIN:        1,
  PUSH:       0,
  LOSS:      -1,
};

/** Dealer stands on soft 17 */
const DEALER_STAND_VALUE = 17;
const SOFT_STAND = true; // dealer stands on soft 17 (not hit)

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Builds a single standard 52-card deck. */
function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Builds and shuffles a fresh N-deck shoe. */
function buildShoe() {
  const shoe = [];
  for (let i = 0; i < NUM_DECKS; i++) shoe.push(...buildDeck());
  return shuffle(shoe);
}

/**
 * Returns the numeric value of a rank (10 for face cards, 11 for Ace).
 * @param {string} rank
 * @returns {number}
 */
function rankValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

/**
 * Calculates the best hand value (handles Ace as 1 or 11).
 * @param {{ rank: string, suit: string }[]} hand
 * @returns {{ value: number, soft: boolean }}
 */
export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    const v = rankValue(card.rank);
    total += v;
    if (card.rank === 'A') aces++;
  }
  // Convert Aces from 11 → 1 as needed
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { value: total, soft: aces > 0 };
}

/** Draws the top card from the shoe and returns [card, updatedShoe]. */
function drawCard(shoe) {
  if (shoe.length === 0) throw new Error('Shoe is empty');
  const [card, ...rest] = shoe;
  return [card, rest];
}

/**
 * Checks if a 2-card hand is a natural blackjack (21).
 * @param {{ rank: string, suit: string }[]} hand
 * @returns {boolean}
 */
function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand).value === 21;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Deals initial hands from a fresh shoe.
 * @returns {{
 *   playerHand: { rank: string, suit: string }[],
 *   dealerHand: { rank: string, suit: string }[],
 *   deckState: { shoe: object[], cardsRemaining: number }
 * }}
 */
export function deal() {
  let shoe = buildShoe();

  let playerCard1, dealerCard1, playerCard2, dealerCard2;
  [playerCard1, shoe] = drawCard(shoe);
  [dealerCard1, shoe] = drawCard(shoe);
  [playerCard2, shoe] = drawCard(shoe);
  [dealerCard2, shoe] = drawCard(shoe);

  const playerHand = [playerCard1, playerCard2];
  const dealerHand = [dealerCard1, dealerCard2]; // dealerHand[1] is face-down

  const deckState = { shoe, cardsRemaining: shoe.length };

  return { playerHand, dealerHand, deckState };
}

/**
 * Deals one card to the given hand from deckState.
 * @param {{ rank: string, suit: string }[]} hand
 * @param {{ shoe: object[], cardsRemaining: number }} deckState
 * @returns {{
 *   hand: { rank: string, suit: string }[],
 *   isBust: boolean,
 *   handValue: number,
 *   deckState: { shoe: object[], cardsRemaining: number }
 * }}
 */
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

/**
 * Player stands — dealer draws to 17+ then outcome is resolved.
 * @param {{ rank: string, suit: string }[]} playerHand
 * @param {{ rank: string, suit: string }[]} dealerHand
 * @param {{ shoe: object[], cardsRemaining: number }} deckState
 * @param {number} betAmount
 * @returns {{
 *   dealerHand: { rank: string, suit: string }[],
 *   outcome: string,
 *   payout: number,
 *   deckState: { shoe: object[], cardsRemaining: number }
 * }}
 */
export function stand(playerHand, dealerHand, deckState, betAmount) {
  let shoe = deckState.shoe;
  let dHand = [...dealerHand];

  // Dealer draws until standing on 17+
  while (true) {
    const { value, soft } = handValue(dHand);
    const mustDraw = value < DEALER_STAND_VALUE ||
      (value === DEALER_STAND_VALUE && !SOFT_STAND && soft);
    if (!mustDraw) break;
    let card;
    [card, shoe] = drawCard(shoe);
    dHand.push(card);
  }

  const playerVal = handValue(playerHand).value;
  const dealerVal = handValue(dHand).value;
  const playerBJ = isBlackjack(playerHand);
  const dealerBJ = isBlackjack(dHand);

  let outcome, multiplier;

  if (playerBJ && dealerBJ) {
    outcome = 'PUSH'; multiplier = PAYOUT.PUSH;
  } else if (playerBJ) {
    outcome = 'BLACKJACK'; multiplier = PAYOUT.BLACKJACK;
  } else if (dealerBJ) {
    outcome = 'LOSS'; multiplier = PAYOUT.LOSS;
  } else if (dealerVal > 21) {
    outcome = 'WIN'; multiplier = PAYOUT.WIN;
  } else if (playerVal > dealerVal) {
    outcome = 'WIN'; multiplier = PAYOUT.WIN;
  } else if (playerVal === dealerVal) {
    outcome = 'PUSH'; multiplier = PAYOUT.PUSH;
  } else {
    outcome = 'LOSS'; multiplier = PAYOUT.LOSS;
  }

  const payout = betAmount * multiplier;
  const newDeckState = { shoe, cardsRemaining: shoe.length };

  return { dealerHand: dHand, outcome, payout, deckState: newDeckState };
}

// ─── ARCHITECT INTERFACE ──────────────────────────────────────────────────────
// deal()                               → { playerHand, dealerHand, deckState }
// hit(hand, deckState)                 → { hand, isBust, handValue, deckState }
// stand(playerHand, dealerHand, deckState, betAmount) → { dealerHand, outcome, payout, deckState }
// handValue(hand)                      → { value: number, soft: boolean }  (for display)

// ─── VAULT INTERFACE ──────────────────────────────────────────────────────────
// POST /api/round after stand() with: { game: 'blackjack', bet: betAmount, outcome, payout,
//   playerFinalValue, dealerFinalValue, cardsRemaining: deckState.cardsRemaining, timestamp }
