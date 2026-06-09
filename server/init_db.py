"""
Initializes voyanabet.db from schema.sql and seeds demo users.
Run: python server/init_db.py
"""

import os
import sqlite3

try:
    from werkzeug.security import generate_password_hash
except ImportError:
    import hashlib, secrets
    def generate_password_hash(pw):
        salt = secrets.token_hex(16)
        h = hashlib.sha256(f"{salt}{pw}".encode()).hexdigest()
        return f"sha256${salt}${h}"

# ─── Paths ────────────────────────────────────────────────────────────────────

DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_FILE = os.path.join(DIR, 'schema.sql')
DB_FILE = os.path.join(DIR, 'voyanabet.db')

# ─── Seed data ────────────────────────────────────────────────────────────────

DEMO_USERS = [
    ('highroller',  'chips4life', 12_500),
    ('luckycharm',  'clover777',   8_750),
    ('vaultking',   'diamonds4u',  6_200),
    ('spinmaster',  'reels2win',   4_100),
    ('newplayer',   'welcome1',    2_500),
]

# ─── Init ─────────────────────────────────────────────────────────────────────

def init_db():
    with open(SCHEMA_FILE, 'r') as f:
        schema = f.read()

    conn = sqlite3.connect(DB_FILE)
    conn.executescript(schema)

    cursor = conn.cursor()
    inserted = 0
    for username, password, balance in DEMO_USERS:
        cursor.execute(
            'INSERT OR IGNORE INTO users (username, password_hash, balance) VALUES (?, ?, ?)',
            (username, generate_password_hash(password), balance),
        )
        if cursor.rowcount:
            inserted += 1

    conn.commit()
    conn.close()

    print(f'✓ Database created:  {DB_FILE}')
    print(f'✓ Users inserted:    {inserted} / {len(DEMO_USERS)}')
    if inserted < len(DEMO_USERS):
        print(f'  (existing users were skipped)')
    print()
    print('Demo credentials:')
    for username, password, balance in DEMO_USERS:
        print(f'  {username:<14} pw={password:<12}  balance={balance:,}')


if __name__ == '__main__':
    init_db()
