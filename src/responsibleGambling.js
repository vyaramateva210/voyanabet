/**
 * @fileoverview Responsible gambling tools: circuit breaker + spending visualizer.
 * Stateful — one session instance per player session.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Lockout fires when session loss exceeds this multiple of the starting bet. */
const LOSS_THRESHOLD_MULTIPLIER = 3;

/** Lockout duration in seconds. */
const LOCKOUT_DURATION = 60;

// ─── Session State ────────────────────────────────────────────────────────────

let startingBet = null;
let cumulativeLoss = 0;
let lockoutUntil = null;        // epoch ms when lockout expires
let spendingLog = [];           // [{ timestamp, bet, payout, netResult, runningBalance }]
let runningBalance = 0;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function nowMs() {
  return Date.now();
}

function lossThreshold() {
  return (startingBet ?? 0) * LOSS_THRESHOLD_MULTIPLIER;
}

function triggerLockout() {
  lockoutUntil = nowMs() + LOCKOUT_DURATION * 1000;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

/**
 * Returns true if the player is currently locked out.
 * @returns {boolean}
 */
export function isLocked() {
  if (lockoutUntil === null) return false;
  if (nowMs() < lockoutUntil) return true;
  // Auto-unlock
  lockoutUntil = null;
  cumulativeLoss = 0;
  return false;
}

/**
 * Returns seconds remaining in the current lockout (0 if not locked).
 * @returns {number}
 */
export function getLockoutRemaining() {
  if (!isLocked()) return 0;
  return Math.ceil((lockoutUntil - nowMs()) / 1000);
}

/**
 * Records a round result and updates the circuit breaker state.
 * Must be called after every game round.
 * @param {number} betAmount - Chips wagered
 * @param {number} payout - Chips returned (0 for loss, positive for win)
 */
export function recordResult(betAmount, payout) {
  if (isLocked()) {
    throw new Error('Session is locked — no bets allowed during lockout');
  }

  // Initialise starting bet from the first round
  if (startingBet === null) startingBet = betAmount;

  const netResult = payout - betAmount;
  runningBalance += netResult;

  if (netResult < 0) {
    cumulativeLoss += Math.abs(netResult);
  } else {
    // A win partially resets the loss accumulator
    cumulativeLoss = Math.max(0, cumulativeLoss - netResult);
  }

  spendingLog.push({
    timestamp: nowMs(),
    bet: betAmount,
    payout,
    netResult,
    runningBalance,
  });

  if (cumulativeLoss > lossThreshold()) {
    triggerLockout();
  }
}

// ─── Spending Visualizer ──────────────────────────────────────────────────────

/**
 * Returns the full spending log for charting.
 * @returns {{ timestamp: number, bet: number, payout: number, netResult: number, runningBalance: number }[]}
 */
export function getSpendingLog() {
  return [...spendingLog];
}

/**
 * Returns a summary of the current session.
 * @returns {{
 *   totalWagered: number,
 *   totalReturned: number,
 *   netProfit: number,
 *   sessionRTP: number,
 *   roundsPlayed: number
 * }}
 */
export function getSpendingSummary() {
  const totalWagered = spendingLog.reduce((s, r) => s + r.bet, 0);
  const totalReturned = spendingLog.reduce((s, r) => s + r.payout, 0);
  const netProfit = totalReturned - totalWagered;
  const sessionRTP = totalWagered > 0 ? (totalReturned / totalWagered) * 100 : 0;

  return {
    totalWagered,
    totalReturned,
    netProfit,
    sessionRTP: parseFloat(sessionRTP.toFixed(2)),
    roundsPlayed: spendingLog.length,
  };
}

/**
 * Resets all session state (balance, loss tracker, log, lockout).
 */
export function resetSession() {
  startingBet = null;
  cumulativeLoss = 0;
  lockoutUntil = null;
  spendingLog = [];
  runningBalance = 0;
}

// ─── ARCHITECT INTERFACE ──────────────────────────────────────────────────────
// isLocked()                → boolean  — disable bet buttons when true
// getLockoutRemaining()     → number   — countdown seconds for lockout UI
// getSpendingLog()          → array    — feed to chart.js / D3 balance curve
// getSpendingSummary()      → object   — render session stats panel
// resetSession()            → void     — "new session" / logout button

// ─── VAULT INTERFACE ──────────────────────────────────────────────────────────
// POST /api/session/summary on resetSession() with getSpendingSummary() payload
// POST /api/session/lockout when isLocked() transitions true (triggered inside recordResult)
