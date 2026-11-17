'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q } = require('./db');

const COOKIE = 'qsid';
const DAY = 24 * 60 * 60 * 1000;
const PERSIST_MS = 30 * DAY;      // "keep me signed in"
const SHORT_MS = 12 * 60 * 60 * 1000; // otherwise: ends with the browser, 12 h at most on the server
const PROD = process.env.NODE_ENV === 'production';
// compared against when the email is unknown, so timing does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
const hashPassword = p => bcrypt.hash(p, 12);
const checkPassword = (p, h) => bcrypt.compare(String(p || ''), h || DUMMY_HASH);
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustChange: u.must_change });

function readCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function setCookie(res, token, persistent) {
  const opts = { httpOnly: true, sameSite: 'lax', secure: PROD, path: '/' };
  if (persistent) opts.maxAge = PERSIST_MS; // without maxAge the browser drops it when it closes
  res.cookie(COOKIE, token, opts);
}

async function startSession(req, res, userId, persistent) {
  const token = crypto.randomBytes(32).toString('hex');
  const ms = persistent ? PERSIST_MS : SHORT_MS;
  await q('INSERT INTO sessions(token_hash,user_id,persistent,expires_at,user_agent) VALUES($1,$2,$3,$4,$5)',
    [sha(token), userId, !!persistent, new Date(Date.now() + ms), String(req.headers['user-agent'] || '').slice(0, 200)]);
  await q('UPDATE users SET last_login=now() WHERE id=$1', [userId]);
  setCookie(res, token, persistent);
}

async function endSession(req, res) {
  const token = readCookie(req);
  if (token) await q('DELETE FROM sessions WHERE token_hash=$1', [sha(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

// Attaches req.user when the cookie maps to a live session of an enabled user.
async function loadUser(req, res, next) {
  try {
    const token = readCookie(req);
    if (!token) return next();
    const h = sha(token);
    const r = await q(`SELECT s.persistent, s.expires_at, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1`, [h]);
    const row = r.rows[0];
    if (!row || row.disabled || new Date(row.expires_at) < new Date()) {
      if (row) await q('DELETE FROM sessions WHERE token_hash=$1', [h]);
      res.clearCookie(COOKIE, { path: '/' });
      return next();
    }
    req.user = row;
    req.sessionHash = h;
    // sliding expiry: extend once the session is past its halfway point
    const ms = row.persistent ? PERSIST_MS : SHORT_MS;
    if (new Date(row.expires_at) - Date.now() < ms / 2) {
      await q('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1', [h, new Date(Date.now() + ms)]);
      setCookie(res, token, row.persistent);
    }
    next();
  } catch (e) { next(e); }
}

const requireUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' });
const requireAdmin = (req, res, next) => req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Only an administrator can do that.' });

async function purgeExpired() {
  await q('DELETE FROM sessions WHERE expires_at < now()').catch(() => {});
}

module.exports = { normEmail, validEmail, hashPassword, checkPassword, publicUser, startSession, endSession, loadUser, requireUser, requireAdmin, purgeExpired };
