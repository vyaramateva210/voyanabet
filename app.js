import { getBalance, setBalance, onBalanceChange } from './src/wallet.js';
import { isLocked, resetSession, getSpendingSummary } from './src/responsibleGambling.js';
import { openSpendingChart } from './src/spending-chart.js';
import { login, register, fetchWallet, syncWallet, postSessionSummary, getLeaderboard } from './src/api_client.js';

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

function decodeTokenUsername() {
  try {
    const token = localStorage.getItem('voyanabet_token');
    if (!token) return null;
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).username || null;
  } catch { return null; }
}

function showUserBadge(username) {
  const nameEl    = document.getElementById('nav-username');
  const logoutBtn = document.getElementById('btn-logout');
  if (username) {
    nameEl.textContent = username;
    nameEl.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    nameEl.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }
}

async function initAuth() {
  const token = localStorage.getItem('voyanabet_token');
  if (token) {
    const data = await fetchWallet();
    if (data?.balance !== undefined) {
      setBalance(data.balance);
      showUserBadge(decodeTokenUsername());
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
  if (data?.token) { setBalance(data.balance); showUserBadge(u); hideAuthModal(); }
  else if (data === null) authError('Cannot reach server — start Flask with: python3 server/app.py');
  else authError(data?.error || 'Wrong username or password');
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value;
  if (!u || !p) return;
  const data = await register(u, p);
  if (data?.token) { setBalance(data.balance); showUserBadge(u); hideAuthModal(); }
  else if (data === null) authError('Cannot reach server — start Flask with: python3 server/app.py');
  else authError(data?.error || 'Registration failed — username may be taken');
});

document.getElementById('btn-play-offline').addEventListener('click', e => {
  e.preventDefault();
  hideAuthModal();
});

document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.removeItem('voyanabet_token');
  showUserBadge(null);
  showAuthModal();
});

window.addEventListener('voyanabet:logout', () => {
  showUserBadge(null);
  showAuthModal();
});

// ── Router ────────────────────────────────────────────────────────────────────

let currentRoute = null;

async function navigate(route, force = false) {
  if (route === currentRoute && !force) return;
  currentRoute = route;
  document.querySelectorAll('[data-route]').forEach(l => l.classList.toggle('active', l.dataset.route === route));
  resetHUD();
  try {
    if (route === 'slots') {
      const { render } = await import('./src/slots-ui.js');
      render(gameView);
    }
  } catch (err) {
    console.error('[navigate] failed to load', route, err);
    currentRoute = null;
    gameView.innerHTML = `<p style="color:#f87171;padding:2rem;font-family:monospace">Failed to load ${route}: ${err.message}</p>`;
  }
}

document.querySelectorAll('[data-route]').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.route); });
});

// ── HUD strip ─────────────────────────────────────────────────────────────────

function resetHUD() {
  document.getElementById('hud-slots')?.classList.add('hidden');
}

window.addEventListener('voyanabet:hud', e => {
  const { type, data } = e.detail;
  if (type === 'slots') {
    document.getElementById('hud-slots')?.classList.remove('hidden');
    document.getElementById('hud-win-chance').textContent = `${(data.winChance*100).toFixed(2)}%`;
    document.getElementById('hud-ev').textContent          = data.expectedValuePerSpin.toFixed(4);
    document.getElementById('hud-jackpot').textContent     = `${(data.jackpotChance*100).toFixed(4)}%`;
  }
});

document.getElementById('btn-my-session').addEventListener('click', openSpendingChart);

document.getElementById('btn-leaderboard').addEventListener('click', openLeaderboard);

async function openLeaderboard() {
  if (document.getElementById('lb-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'lb-modal';
  overlay.className = 'lb-overlay';
  overlay.innerHTML = `
    <div class="lb-card">
      <div class="lb-header">
        <span class="lb-title">🏆 Leaderboard</span>
        <button class="btn btn-ghost" id="lb-close" style="padding:.25rem .6rem">✕</button>
      </div>
      <div id="lb-body"><p class="lb-empty">Loading…</p></div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('lb-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const data = await getLeaderboard();
  const body = document.getElementById('lb-body');
  if (!data) {
    body.innerHTML = `<p class="lb-empty">Server offline — start Flask to see rankings.</p>`;
    return;
  }
  body.innerHTML = `
    <table class="lb-table">
      <thead><tr><th>#</th><th>Player</th><th>Balance</th></tr></thead>
      <tbody>
        ${data.map(r => `<tr>
          <td class="lb-rank">${r.rank}</td>
          <td>${r.username}</td>
          <td class="lb-balance">⬡ ${r.balance.toLocaleString()}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('btn-new-session').addEventListener('click', () => {
  if (isLocked()) return;
  postSessionSummary(getSpendingSummary());
  resetSession();
  navigate('slots', true);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initAuth().then(() => navigate('slots'));
