import { spin } from './slots.js';
import { deal } from './blackjack.js';

const REEL_STOP_DELAYS = [600, 1200, 1800];
const CARD_DEAL_DELAY  = 300;
const COUNTDOWN_TICK   = 1000;

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function spinWithSuspense(betAmount, onReelStop) {
  const result = spin(betAmount);
  for (let i = 0; i < result.reels.length; i++) {
    await wait(REEL_STOP_DELAYS[i] - (i > 0 ? REEL_STOP_DELAYS[i - 1] : 0));
    onReelStop?.(i, result.reels[i]);
  }
  return result;
}

export async function dealWithSuspense(onCardDealt) {
  const result = deal();
  const { playerHand, dealerHand } = result;
  const sequence = [
    { card: playerHand[0], to: 'player', index: 0 },
    { card: dealerHand[0], to: 'dealer', index: 0 },
    { card: playerHand[1], to: 'player', index: 1 },
    { card: dealerHand[1], to: 'dealer', index: 1, faceDown: true },
  ];
  for (const event of sequence) {
    await wait(CARD_DEAL_DELAY);
    onCardDealt?.(event);
  }
  return result;
}

export function createCountdown(seconds) {
  let intervalId = null;
  let tickCb = null;
  let remaining = seconds;

  return {
    onTick(cb) { tickCb = cb; },
    start() {
      remaining = seconds;
      tickCb?.(remaining);
      intervalId = setInterval(() => {
        remaining--;
        tickCb?.(remaining);
        if (remaining <= 0) { clearInterval(intervalId); intervalId = null; }
      }, COUNTDOWN_TICK);
    },
    cancel() {
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
    },
  };
}
