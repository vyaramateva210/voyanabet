-- Voyanabet database schema
-- Run: python server/init_db.py

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  balance       INTEGER NOT NULL DEFAULT 2500,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  game      TEXT    NOT NULL,  -- 'slots' | 'blackjack'
  bet       INTEGER NOT NULL,
  payout    INTEGER NOT NULL,
  outcome   TEXT    NOT NULL,
  played_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  total_wagered  INTEGER NOT NULL,
  total_returned INTEGER NOT NULL,
  net_profit     INTEGER NOT NULL,
  session_rtp    REAL    NOT NULL,
  rounds_played  INTEGER NOT NULL,
  locked_out     INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1
  ended_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lockout_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  locked_at  TEXT    NOT NULL,
  reason     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
