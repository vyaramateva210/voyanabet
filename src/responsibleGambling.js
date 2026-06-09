const LOSS_THRESHOLD_MULTIPLIER = 3;
const LOCKOUT_DURATION = 60; // seconds

let startingBet    = null;
let cumulativeLoss = 0;
let lockoutUntil   = null;
let spendingLog    = [];
let runningBalance = 0;

function lossThreshold() {
  return (startingBet ?? 0) * LOSS_THRESHOLD_MULTIPLIER;
}

export function isLocked() {
  if (lockoutUntil === null) return false;
  if (Date.now() < lockoutUntil) return true;
  lockoutUntil   = null;
  cumulativeLoss = 0;
  return false;
}

export function getLockoutRemaining() {
  if (!isLocked()) return 0;
  return Math.ceil((lockoutUntil - Date.now()) / 1000);
}

export function recordResult(betAmount, payout) {
  if (isLocked()) throw new Error('Session is locked');
  if (startingBet === null) startingBet = betAmount;

  const netResult = payout - betAmount;
  runningBalance += netResult;

  if (netResult < 0) {
    cumulativeLoss += Math.abs(netResult);
  } else {
    cumulativeLoss = Math.max(0, cumulativeLoss - netResult);
  }

  spendingLog.push({ timestamp: Date.now(), bet: betAmount, payout, netResult, runningBalance });

  if (cumulativeLoss > lossThreshold()) {
    lockoutUntil = Date.now() + LOCKOUT_DURATION * 1000;
  }
}

export function getSpendingLog() {
  return [...spendingLog];
}

export function getSpendingSummary() {
  const totalWagered  = spendingLog.reduce((s, r) => s + r.bet, 0);
  const totalReturned = spendingLog.reduce((s, r) => s + r.payout, 0);
  const netProfit     = totalReturned - totalWagered;
  const sessionRTP    = totalWagered > 0 ? (totalReturned / totalWagered) * 100 : 0;
  return {
    totalWagered,
    totalReturned,
    netProfit,
    sessionRTP: parseFloat(sessionRTP.toFixed(2)),
    roundsPlayed: spendingLog.length,
  };
}

export function resetSession() {
  startingBet    = null;
  cumulativeLoss = 0;
  lockoutUntil   = null;
  spendingLog    = [];
  runningBalance = 0;
}
