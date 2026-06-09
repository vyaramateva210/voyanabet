const STARTING_BALANCE = 2500;
const STORAGE_KEY = 'voyanabet_balance';

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    const n = v !== null ? parseInt(v, 10) : NaN;
    return isNaN(n) ? STARTING_BALANCE : n;
  } catch {
    return STARTING_BALANCE;
  }
}

let balance = readStored();
const listeners = new Set();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, String(balance)); } catch {}
}

function notify() {
  listeners.forEach(cb => cb(balance));
}

export function getBalance() {
  return balance;
}

export function updateWallet(delta) {
  if (balance + delta < 0) throw new Error(`Insufficient balance: have ${balance}, need ${Math.abs(delta)}`);
  balance += delta;
  persist();
  notify();
}

export function setBalance(amount) {
  if (amount < 0) throw new RangeError('Balance cannot be negative');
  balance = amount;
  persist();
  notify();
}

// returns unsubscribe fn
export function onBalanceChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
