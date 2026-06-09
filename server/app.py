"""
Voyanabet Flask API — Verdant Vault backend.
Run: python server/app.py
Requires: flask flask-cors werkzeug
"""

import os
import sqlite3
import json
import hmac
import hashlib
import base64
import time
from functools import wraps

from flask import Flask, request, jsonify, g
from flask_cors import CORS

try:
    from werkzeug.security import generate_password_hash, check_password_hash
except ImportError:
    import secrets
    def generate_password_hash(pw):
        salt = secrets.token_hex(16)
        h = hashlib.sha256(f"{salt}{pw}".encode()).hexdigest()
        return f"sha256${salt}${h}"
    def check_password_hash(stored, pw):
        _, salt, h = stored.split('$')
        return hmac.compare_digest(h, hashlib.sha256(f"{salt}{pw}".encode()).hexdigest())

# ─── Config ───────────────────────────────────────────────────────────────────

SECRET = os.environ.get('VOYANABET_SECRET', 'dev-secret')
DIR    = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DIR, 'voyanabet.db')

app = Flask(__name__)
CORS(app, origins=['http://127.0.0.1', 'http://localhost',
                   'http://127.0.0.1:5173', 'http://localhost:5173',
                   'http://127.0.0.1:3000', 'http://localhost:3000'])

# ─── Mock JWT ─────────────────────────────────────────────────────────────────

def _b64enc(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def _b64dec(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + ('=' * (pad % 4)))

def create_token(user_id: int, username: str) -> str:
    header  = _b64enc(json.dumps({'alg': 'HS256', 'typ': 'mock-jwt'}).encode())
    payload = _b64enc(json.dumps({
        'user_id':  user_id,
        'username': username,
        'iat':      int(time.time()),
    }).encode())
    sig_input = f'{header}.{payload}'.encode()
    sig = _b64enc(hmac.new(SECRET.encode(), sig_input, hashlib.sha256).digest())
    return f'{header}.{payload}.{sig}'

def verify_token(token: str):
    """Returns decoded payload dict or None."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header, payload, sig = parts
        sig_input = f'{header}.{payload}'.encode()
        expected = _b64enc(hmac.new(SECRET.encode(), sig_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        return json.loads(_b64dec(payload))
    except Exception:
        return None

# ─── Auth decorator ───────────────────────────────────────────────────────────

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': 'Missing token'}), 401
        payload = verify_token(auth[7:])
        if payload is None:
            return jsonify({'error': 'Invalid token'}), 401
        g.user = payload
        return f(*args, **kwargs)
    return decorated

# ─── Database ─────────────────────────────────────────────────────────────────

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA journal_mode=WAL')
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db:
        db.close()

# ─── Auth endpoints ───────────────────────────────────────────────────────────

@app.post('/api/auth/register')
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({'error': 'username and password required'}), 400
    if len(username) < 3 or len(username) > 32:
        return jsonify({'error': 'username must be 3–32 characters'}), 400

    db = get_db()
    try:
        db.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already taken'}), 409

    row = db.execute('SELECT id, balance FROM users WHERE username = ?', (username,)).fetchone()
    token = create_token(row['id'], username)
    return jsonify({'token': token, 'balance': row['balance']}), 201

@app.post('/api/auth/login')
def login_route():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    db = get_db()
    row = db.execute('SELECT id, password_hash, balance FROM users WHERE username = ?', (username,)).fetchone()
    if not row or not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = create_token(row['id'], username)
    return jsonify({'token': token, 'balance': row['balance']})

# ─── Wallet endpoints ─────────────────────────────────────────────────────────

@app.get('/api/wallet')
@require_auth
def get_wallet():
    db = get_db()
    row = db.execute('SELECT balance FROM users WHERE id = ?', (g.user['user_id'],)).fetchone()
    if not row:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'balance': row['balance']})

@app.post('/api/wallet/sync')
@require_auth
def sync_wallet():
    data = request.get_json(silent=True) or {}
    balance = data.get('balance')
    if not isinstance(balance, (int, float)) or balance < 0:
        return jsonify({'error': 'Invalid balance'}), 400
    db = get_db()
    db.execute('UPDATE users SET balance = ? WHERE id = ?', (int(balance), g.user['user_id']))
    db.commit()
    return jsonify({'ok': True, 'balance': int(balance)})

# ─── Round endpoint ───────────────────────────────────────────────────────────

@app.post('/api/round')
@require_auth
def post_round():
    data = request.get_json(silent=True) or {}
    game    = data.get('game')
    bet     = data.get('bet')
    payout  = data.get('payout')
    outcome = data.get('outcome')

    if game not in ('slots', 'blackjack') or not isinstance(bet, (int, float)) \
       or not isinstance(payout, (int, float)) or not outcome:
        return jsonify({'error': 'Invalid round data'}), 400

    db = get_db()
    db.execute(
        'INSERT INTO rounds (user_id, game, bet, payout, outcome) VALUES (?, ?, ?, ?, ?)',
        (g.user['user_id'], game, int(bet), int(payout), outcome),
    )
    db.commit()
    return jsonify({'ok': True}), 201

# ─── Leaderboard endpoint ─────────────────────────────────────────────────────

@app.get('/api/leaderboard')
def leaderboard():
    db = get_db()
    rows = db.execute(
        'SELECT username, balance FROM users ORDER BY balance DESC LIMIT 5'
    ).fetchall()
    return jsonify([
        {'rank': i + 1, 'username': r['username'], 'balance': r['balance']}
        for i, r in enumerate(rows)
    ])

# ─── Session endpoints ────────────────────────────────────────────────────────

@app.post('/api/session/summary')
@require_auth
def session_summary():
    data = request.get_json(silent=True) or {}
    fields = ('totalWagered', 'totalReturned', 'netProfit', 'sessionRTP', 'roundsPlayed')
    if not all(k in data for k in fields):
        return jsonify({'error': 'Missing session fields'}), 400

    db = get_db()
    db.execute(
        '''INSERT INTO sessions
           (user_id, total_wagered, total_returned, net_profit, session_rtp, rounds_played)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (g.user['user_id'], data['totalWagered'], data['totalReturned'],
         data['netProfit'], data['sessionRTP'], data['roundsPlayed']),
    )
    db.commit()
    return jsonify({'ok': True}), 201

@app.post('/api/session/lockout')
@require_auth
def session_lockout():
    data = request.get_json(silent=True) or {}
    locked_at = data.get('lockedAt') or ''
    reason    = data.get('reason', 'loss_threshold')

    db = get_db()
    db.execute(
        'INSERT INTO lockout_events (user_id, locked_at, reason) VALUES (?, ?, ?)',
        (g.user['user_id'], str(locked_at), reason),
    )
    db.commit()
    return jsonify({'ok': True}), 201

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if not os.path.exists(DB_PATH):
        print(f'[warn] Database not found at {DB_PATH} — run: python server/init_db.py')
    app.run(host='127.0.0.1', port=5000, debug=True)

# ─── FLASK INTERFACE ──────────────────────────────────────────────────────────
# POST /api/auth/register       { username, password }           → { token, balance }
# POST /api/auth/login          { username, password }           → { token, balance }
# GET  /api/wallet              (auth)                           → { balance }
# POST /api/wallet/sync         (auth) { balance }              → { ok, balance }
# POST /api/round               (auth) { game, bet, payout, outcome, timestamp } → { ok }
# GET  /api/leaderboard                                          → [{ rank, username, balance }]
# POST /api/session/summary     (auth) { totalWagered, ... }    → { ok }
# POST /api/session/lockout     (auth) { lockedAt, reason }     → { ok }
