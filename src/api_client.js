const API_BASE = '';
const TOKEN_KEY = 'voyanabet_token';

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function storeToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}

function clearAuth() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  window.dispatchEvent(new Event('voyanabet:logout'));
}

async function apiFetch(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { clearAuth(); return null; }
    return await res.json();
  } catch (err) {
    // server probably not running — app still works offline
    console.warn(`[api] ${method} ${path} failed: ${err.message}`);
    return null;
  }
}

export async function register(username, password) {
  const data = await apiFetch('/api/auth/register', { method: 'POST', body: { username, password } });
  if (data?.token) storeToken(data.token);
  return data;
}

export async function login(username, password) {
  const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } });
  if (data?.token) storeToken(data.token);
  return data;
}

export async function fetchWallet() {
  return apiFetch('/api/wallet');
}

export async function syncWallet(balance) {
  return apiFetch('/api/wallet/sync', { method: 'POST', body: { balance } });
}

export async function spinSlots(bet) {
  return apiFetch('/api/slots/spin', { method: 'POST', body: { bet } });
}

export async function postRound(roundData) {
  return apiFetch('/api/round', { method: 'POST', body: roundData });
}

export async function getLeaderboard() {
  return apiFetch('/api/leaderboard');
}

export async function postSessionSummary(data) {
  return apiFetch('/api/session/summary', { method: 'POST', body: data });
}

export async function postLockoutEvent(data) {
  return apiFetch('/api/session/lockout', { method: 'POST', body: data });
}
