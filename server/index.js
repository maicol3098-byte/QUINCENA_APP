'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { q, withTx, migrate, pool } = require('./db');
const A = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOW_SIGNUP = String(process.env.ALLOW_SIGNUP || 'false').toLowerCase() === 'true';
const MIN_PASS = 8;

app.set('trust proxy', 1); // Railway terminates TLS in front of the app
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
    },
  },
}));
app.use(compression());
app.use(express.json({ limit: '8mb' }));

app.get('/healthz', async (req, res) => {
  try { await q('SELECT 1'); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false }); }
});

// Every state-changing API call must come from our own page: custom header plus same-origin check.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get('X-Requested-With') !== 'quincena') return res.status(403).json({ error: 'Request refused.' });
  const origin = req.get('Origin');
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Request refused.' }); }
    catch (e) { return res.status(403).json({ error: 'Request refused.' }); }
  }
  next();
});
app.use('/api', A.loadUser);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Wait a few minutes and try again.' } });
const userCount = async () => +(await q('SELECT count(*)::int AS n FROM users')).rows[0].n;
const bump = (c, uid) => c.query('UPDATE user_state SET rev=rev+1 WHERE user_id=$1 RETURNING rev', [uid]).then(r => +r.rows[0].rev);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const validId = id => typeof id === 'string' && /^[\w-]{1,48}$/.test(id);
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function createUser(c, { email, name, password, role, mustChange }) {
  const hash = await A.hashPassword(password);
  const r = await c.query('INSERT INTO users(email,name,pass_hash,role,must_change) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [email, String(name || '').trim().slice(0, 80), hash, role, !!mustChange]);
  await c.query('INSERT INTO user_state(user_id) VALUES($1)', [r.rows[0].id]);
  return r.rows[0];
}

/* ---------- session ---------- */
app.get('/api/me', wrap(async (req, res) => {
  if (req.user) return res.json({ user: A.publicUser(req.user) });
  const n = await userCount();
  res.status(401).json({ error: 'Not signed in.', firstUser: n === 0, signup: n === 0 || ALLOW_SIGNUP });
}));

app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const email = A.normEmail(req.body.email), password = String(req.body.password || '');
  if (!A.validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < MIN_PASS) return res.status(400).json({ error: `Use a password of at least ${MIN_PASS} characters.` });
  const user = await withTx(async c => {
    await c.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const n = +(await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
    if (n > 0 && !ALLOW_SIGNUP) return { refused: true };
    if ((await c.query('SELECT 1 FROM users WHERE email=$1', [email])).rowCount) return { taken: true };
    return createUser(c, { email, name: req.body.name, password, role: n === 0 ? 'admin' : 'user' }); // the first account runs the place
  });
  if (user.refused) return res.status(403).json({ error: 'Sign-up is closed. Ask an administrator to create your account.' });
  if (user.taken) return res.status(409).json({ error: 'That email already has an account. Sign in instead.' });
  await A.startSession(req, res, user.id, !!req.body.remember);
  res.json({ user: A.publicUser(user) });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const email = A.normEmail(req.body.email);
  const u = (await q('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  const ok = await A.checkPassword(req.body.password, u && u.pass_hash);
  if (!u || !ok) return res.status(401).json({ error: 'That email and password do not match.' });
  if (u.disabled) return res.status(403).json({ error: 'This account is disabled. Ask an administrator.' });
  await A.startSession(req, res, u.id, !!req.body.remember);
  res.json({ user: A.publicUser(u) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => { await A.endSession(req, res); res.json({ ok: true }); }));

app.post('/api/auth/logout-all', A.requireUser, wrap(async (req, res) => {
  await q('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
  await A.endSession(req, res);
  res.json({ ok: true });
}));

app.post('/api/auth/password', A.requireUser, authLimiter, wrap(async (req, res) => {
  const next = String(req.body.next || '');
  if (!(await A.checkPassword(req.body.current, req.user.pass_hash))) return res.status(400).json({ error: 'Your current password is not right.' });
  if (next.length < MIN_PASS) return res.status(400).json({ error: `Use a new password of at least ${MIN_PASS} characters.` });
  await q('UPDATE users SET pass_hash=$2, must_change=FALSE WHERE id=$1', [req.user.id, await A.hashPassword(next)]);
  await q('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [req.user.id, req.sessionHash]); // other devices must sign in again
  res.json({ ok: true });
}));

app.patch('/api/me', A.requireUser, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const r = await q('UPDATE users SET name=$2 WHERE id=$1 RETURNING *', [req.user.id, name]);
  res.json({ user: A.publicUser(r.rows[0]) });
}));

/* ---------- a user's own data ---------- */
app.get('/api/state', A.requireUser, wrap(async (req, res) => {
  const s = (await q('SELECT config,drafts,rev FROM user_state WHERE user_id=$1', [req.user.id])).rows[0];
  const t = await q('SELECT id,data FROM tx WHERE user_id=$1', [req.user.id]);
  res.json({ config: s.config, drafts: s.drafts, rev: +s.rev, tx: t.rows.map(r => Object.assign({}, r.data, { id: r.id })) });
}));

app.get('/api/rev', A.requireUser, wrap(async (req, res) => {
  res.json({ rev: +(await q('SELECT rev FROM user_state WHERE user_id=$1', [req.user.id])).rows[0].rev });
}));

app.put('/api/config', A.requireUser, wrap(async (req, res) => {
  if (!isObj(req.body)) return res.status(400).json({ error: 'Bad settings.' });
  const rev = await withTx(async c => { await c.query('UPDATE user_state SET config=$2 WHERE user_id=$1', [req.user.id, JSON.stringify(req.body)]); return bump(c, req.user.id); });
  res.json({ rev });
}));

app.put('/api/drafts', A.requireUser, wrap(async (req, res) => {
  if (!isObj(req.body)) return res.status(400).json({ error: 'Bad drafts.' });
  const rev = await withTx(async c => { await c.query('UPDATE user_state SET drafts=$2 WHERE user_id=$1', [req.user.id, JSON.stringify(req.body)]); return bump(c, req.user.id); });
  res.json({ rev });
}));

const UPSERT = 'INSERT INTO tx(user_id,id,d,data) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,id) DO UPDATE SET d=EXCLUDED.d, data=EXCLUDED.data, updated_at=now()';
const cleanTx = body => { const b = Object.assign({}, body); delete b.id; return b; };

app.put('/api/tx/:id', A.requireUser, wrap(async (req, res) => {
  if (!validId(req.params.id) || !isObj(req.body) || !validDate(req.body.d)) return res.status(400).json({ error: 'That movement is not valid.' });
  const rev = await withTx(async c => { await c.query(UPSERT, [req.user.id, req.params.id, req.body.d, JSON.stringify(cleanTx(req.body))]); return bump(c, req.user.id); });
  res.json({ rev });
}));

app.delete('/api/tx/:id', A.requireUser, wrap(async (req, res) => {
  const rev = await withTx(async c => { await c.query('DELETE FROM tx WHERE user_id=$1 AND id=$2', [req.user.id, req.params.id]); return bump(c, req.user.id); });
  res.json({ rev });
}));

async function writeMany(c, uid, put, del) {
  for (const id of del) await c.query('DELETE FROM tx WHERE user_id=$1 AND id=$2', [uid, id]);
  for (const x of put) await c.query(UPSERT, [uid, x.id, x.d, JSON.stringify(cleanTx(x))]);
}
const badList = put => !Array.isArray(put) || put.length > 20000 || put.some(x => !isObj(x) || !validId(x.id) || !validDate(x.d));

app.post('/api/tx/bulk', A.requireUser, wrap(async (req, res) => {
  const put = req.body.put || [], del = req.body.del || [];
  if (badList(put) || !Array.isArray(del) || del.some(id => !validId(id))) return res.status(400).json({ error: 'Some movements in that batch are not valid.' });
  const rev = await withTx(async c => { await writeMany(c, req.user.id, put, del); return bump(c, req.user.id); });
  res.json({ rev });
}));

// Replace everything with a backup file (the same shape "Download a backup" produces).
app.post('/api/restore', A.requireUser, wrap(async (req, res) => {
  const { config, drafts, movements } = req.body || {};
  if (!isObj(config) || badList(movements || [])) return res.status(400).json({ error: 'That file is not a Quincena backup.' });
  const rev = await withTx(async c => {
    await c.query('DELETE FROM tx WHERE user_id=$1', [req.user.id]);
    await c.query('UPDATE user_state SET config=$2, drafts=$3 WHERE user_id=$1', [req.user.id, JSON.stringify(config), JSON.stringify(isObj(drafts) ? drafts : { cards: {} })]);
    await writeMany(c, req.user.id, movements || [], []);
    return bump(c, req.user.id);
  });
  res.json({ rev });
}));

/* ---------- reference exchange rate (Costa Rica, BCCR via Ministerio de Hacienda) ---------- */
let fxCache = null;
app.get('/api/fx', A.requireUser, wrap(async (req, res) => {
  if (fxCache && Date.now() - fxCache.at < 3 * 60 * 60 * 1000) return res.json(fxCache.data);
  try {
    const r = await fetch('https://api.hacienda.go.cr/indicadores/tc', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await r.json();
    const data = { venta: +j.dolar.venta.valor, compra: +j.dolar.compra.valor, date: String(j.dolar.venta.fecha).slice(0, 10), source: 'BCCR reference rate (Ministerio de Hacienda)' };
    if (!(data.venta > 0)) throw new Error('no rate');
    fxCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'The reference rate could not be fetched right now.' });
  }
}));

/* ---------- user management (administrators) ---------- */
const listUsers = async () => (await q(`SELECT u.id,u.email,u.name,u.role,u.disabled,u.must_change,u.created_at,u.last_login,
  (SELECT count(*)::int FROM tx t WHERE t.user_id=u.id) AS movements FROM users u ORDER BY u.id`)).rows;
const otherAdmins = async id => +(await q("SELECT count(*)::int AS n FROM users WHERE role='admin' AND NOT disabled AND id<>$1", [id])).rows[0].n;

app.get('/api/users', A.requireAdmin, wrap(async (req, res) => res.json({ users: await listUsers(), signup: ALLOW_SIGNUP })));

app.post('/api/users', A.requireAdmin, wrap(async (req, res) => {
  const email = A.normEmail(req.body.email), password = String(req.body.password || '');
  if (!A.validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < MIN_PASS) return res.status(400).json({ error: `Give them a temporary password of at least ${MIN_PASS} characters.` });
  if ((await q('SELECT 1 FROM users WHERE email=$1', [email])).rowCount) return res.status(409).json({ error: 'That email already has an account.' });
  await withTx(c => createUser(c, { email, name: req.body.name, password, role: req.body.role === 'admin' ? 'admin' : 'user', mustChange: true }));
  res.json({ users: await listUsers() });
}));

app.patch('/api/users/:id', A.requireAdmin, wrap(async (req, res) => {
  const id = +req.params.id, b = req.body || {};
  const u = (await q('SELECT * FROM users WHERE id=$1', [id])).rows[0];
  if (!u) return res.status(404).json({ error: 'That user no longer exists.' });
  const losesAdmin = u.role === 'admin' && ((b.role && b.role !== 'admin') || b.disabled === true);
  if (losesAdmin && !(await otherAdmins(id))) return res.status(400).json({ error: 'There has to be at least one active administrator.' });
  if (b.role === 'admin' || b.role === 'user') await q('UPDATE users SET role=$2 WHERE id=$1', [id, b.role]);
  if (typeof b.disabled === 'boolean') {
    await q('UPDATE users SET disabled=$2 WHERE id=$1', [id, b.disabled]);
    if (b.disabled) await q('DELETE FROM sessions WHERE user_id=$1', [id]);
  }
  if (typeof b.name === 'string') await q('UPDATE users SET name=$2 WHERE id=$1', [id, b.name.trim().slice(0, 80)]);
  if (b.password != null) {
    if (String(b.password).length < MIN_PASS) return res.status(400).json({ error: `Use a temporary password of at least ${MIN_PASS} characters.` });
    await q('UPDATE users SET pass_hash=$2, must_change=TRUE WHERE id=$1', [id, await A.hashPassword(String(b.password))]);
    await q('DELETE FROM sessions WHERE user_id=$1', [id]);
  }
  res.json({ users: await listUsers() });
}));

app.delete('/api/users/:id', A.requireAdmin, wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account here.' });
  const u = (await q('SELECT role FROM users WHERE id=$1', [id])).rows[0];
  if (u && u.role === 'admin' && !(await otherAdmins(id))) return res.status(400).json({ error: 'There has to be at least one active administrator.' });
  await q('DELETE FROM users WHERE id=$1', [id]); // their data goes with them (ON DELETE CASCADE)
  res.json({ users: await listUsers() });
}));

/* ---------- static app ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '5m', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too much data for one request.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

migrate().then(() => {
  setInterval(A.purgeExpired, 6 * 60 * 60 * 1000).unref();
  app.listen(PORT, () => console.log(`Quincena listening on :${PORT} (sign-up ${ALLOW_SIGNUP ? 'open' : 'closed after the first account'})`));
}).catch(e => { console.error('Could not prepare the database:', e.message); process.exit(1); });

process.on('SIGTERM', () => pool.end().finally(() => process.exit(0)));
