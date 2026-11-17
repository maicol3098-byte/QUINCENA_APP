'use strict';
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. On Railway, add a PostgreSQL service and reference its DATABASE_URL.');
  process.exit(1);
}
// Railway's private network needs no TLS; public proxy URLs do. PGSSLMODE=require or ?sslmode=require turns it on.
const wantsSsl = /sslmode=require/.test(url) || process.env.PGSSLMODE === 'require';
const pool = new Pool({ connectionString: url, max: 10, ssl: wantsSsl ? { rejectUnauthorized: false } : undefined });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  pass_hash   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  disabled    BOOLEAN NOT NULL DEFAULT FALSE,
  must_change BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persistent  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS user_state (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  drafts      JSONB NOT NULL DEFAULT '{"cards":{}}'::jsonb,
  rev         BIGINT NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tx (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  d           TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS tx_user_date ON tx(user_id, d);
`;

async function migrate() {
  await pool.query(SCHEMA);
}

const q = (text, params) => pool.query(text, params);

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, q, withTx, migrate };
