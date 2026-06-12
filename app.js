import { getBalance, setBalance, onBalanceChange } from './src/wallet.js';
import { isLocked, resetSession, getSpendingSummary } from './src/responsibleGambling.js';
import { openSpendingChart } from './src/spending-chart.js';
import { login, register, fetchWallet, syncWallet, postSessionSummary } from './src/api_client.js';

const gameView      = document.getElementById('game-view');
const walletDisplay = document.getElementById('wallet-balance');

walletDisplay.textContent = getBalance().toLocaleString();

// debounced backend sync on every balance change
let syncTimer;
onBalanceChange(balance => {
  walletDisplay.textContent = balance.toLocaleString();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncWallet(balance), 1000);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

async function initAuth() {
  const token = localStorage.getItem('voyanabet_token');
  if (token) {
    const data = await fetchWallet();
    if (data?.balance !== undefined) {
      setBalance(data.balance);
      return;
    }
  }
  showAuthModal();
}

function showAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); }
function hideAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); }

function authError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value;
  if (!u || !p) return;
  const data = await login(u, p);
  if (data?.token) { setBalance(data.balance); hideAuthModal(); }
  else if (data === null) authError('Cannot reach server — start Flask with: python3 server/app.py');
  else authError(data?.error || 'Wrong username or password');
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value;
  if (!u || !p) return;
  const data = await register(u, p);
  if (data?.token) { setBalance(data.balance); hideAuthModal(); }
  else if (data === null) authError('Cannot reach server — start Flask with: python3 server/app.py');
  else authError(data?.error || 'Registration failed — username may be taken');
});

document.getElementById('btn-play-offline').addEventListener('click', e => {
  e.preventDefault();
  hideAuthModal();
});

// ── Router ────────────────────────────────────────────────────────────────────

let currentRoute = null;

async function navigate(route) {
  if (route === currentRoute) return;
  currentRoute = route;
  document.querySelectorAll('[data-route]').forEach(l => l.classList.toggle('active', l.dataset.route === route));
  resetHUD();
  if (route === 'slots') {
    const { render } = await import('./src/slots-ui.js');
    render(gameView);
  } else if (route === 'blackjack') {
    const { render } = await import('./src/blackjack-ui.js');
    render(gameView);
  }
}

document.querySelectorAll('[data-route]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.route); });
});

// ── HUD strip ─────────────────────────────────────────────────────────────────

function resetHUD() {
  document.getElementById('hud-slots')?.classList.add('hidden');
  document.getElementById('hud-bj')?.classList.add('hidden');
}

window.addEventListener('voyanabet:hud', e => {
  const { type, data } = e.detail;
  if (type === 'slots') {
    document.getElementById('hud-slots')?.classList.remove('hidden');
    document.getElementById('hud-bj')?.classList.add('hidden');
    document.getElementById('hud-win-chance').textContent = `${(data.winChance*100).toFixed(2)}%`;
    document.getElementById('hud-ev').textContent          = data.expectedValuePerSpin.toFixed(4);
    document.getElementById('hud-jackpot').textContent     = `${(data.jackpotChance*100).toFixed(4)}%`;
  }
  if (type === 'blackjack') {
    document.getElementById('hud-bj')?.classList.remove('hidden');
    document.getElementById('hud-slots')?.classList.add('hidden');
    document.getElementById('hud-bust').textContent        = `${(data.bustRisk*100).toFixed(1)}%`;
    document.getElementById('hud-dealer-bust').textContent = `${(data.dealerBustChance*100).toFixed(1)}%`;
    document.getElementById('hud-win-stand').textContent   = `${(data.winIfStand*100).toFixed(1)}%`;
    const actionEl = document.getElementById('hud-action');
    actionEl.textContent = data.recommendedAction;
    actionEl.style.color = { HIT: '#f5c842', STAND: '#22c55e', DOUBLE: '#a855f7' }[data.recommendedAction] || '';
  }
});

document.getElementById('btn-my-session').addEventListener('click', openSpendingChart);

document.getElementById('btn-new-session').addEventListener('click', () => {
  if (isLocked()) return;
  postSessionSummary(getSpendingSummary());
  resetSession();
  navigate('slots');
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initAuth().then(() => navigate('slots'));
