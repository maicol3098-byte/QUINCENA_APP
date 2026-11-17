'use strict';
// End-to-end check of the API against a real PostgreSQL database.
// Usage: DATABASE_URL=postgres://... npm test   (use an empty scratch database: it creates and deletes users)
const { spawn } = require('child_process');
const assert = require('assert');
const PORT = 4100 + Math.floor(Math.random() * 500), BASE = 'http://127.0.0.1:' + PORT;

function client() {
  let cookie = '', lastSetCookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'quincena', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie');
    if (sc) { lastSetCookie = sc; const v = sc.split(';')[0]; cookie = v.endsWith('=') ? '' : v; }
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, body: j };
  };
  return { call, setCookie: () => lastSetCookie };
}

(async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, ALLOW_SIGNUP: 'false' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, no) => { srv.stdout.on('data', d => /listening/.test(d) && ok()); srv.on('exit', c => no(new Error('server exited ' + c))); });
  const tag = Date.now().toString(36), mail = n => `${n}-${tag}@example.com`;
  try {
    const a = client(), b = client(), anon = client();
    let r = await anon.call('GET', '/api/me'); assert.equal(r.status, 401);
    const first = r.body.firstUser;

    // first account becomes the administrator (only on an empty database)
    r = await a.call('POST', '/api/auth/register', { email: mail('admin'), name: 'Admin', password: 'correct horse', remember: true });
    if (first) { assert.equal(r.status, 200); assert.equal(r.body.user.role, 'admin'); assert.match(a.setCookie(), /Max-Age=2592000/); assert.match(a.setCookie(), /HttpOnly/); }
    else { console.log('database not empty: skipping first-user checks'); return; }

    // sign-up is closed once someone exists
    r = await b.call('POST', '/api/auth/register', { email: mail('eve'), password: 'longenough1' }); assert.equal(r.status, 403);
    // requests without the app header are refused
    const raw = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(raw.status, 403);

    // admin creates a member with a temporary password
    r = await a.call('POST', '/api/users', { email: mail('bea'), name: 'Bea', password: 'temporary1' }); assert.equal(r.status, 200);
    const bea = r.body.users.find(u => u.email === mail('bea')); assert.ok(bea.must_change);
    r = await b.call('POST', '/api/auth/login', { email: mail('bea'), password: 'wrong' }); assert.equal(r.status, 401);
    r = await b.call('POST', '/api/auth/login', { email: mail('BEA').toUpperCase(), password: 'temporary1', remember: false }); assert.equal(r.status, 200);
    assert.ok(!/Max-Age/.test(b.setCookie()), 'session cookie must not persist without "keep me signed in"');
    assert.equal(r.body.user.mustChange, true);
    r = await b.call('GET', '/api/users'); assert.equal(r.status, 403);

    // each person only sees their own data
    r = await a.call('PUT', '/api/config', { settings: { base: 'CRC' }, accounts: [{ id: 'x', name: 'Mine' }] }); assert.equal(r.status, 200);
    r = await a.call('PUT', '/api/tx/t1', { t: 'expense', d: '2026-11-16', a: 'x', amt: 1500, base: 1500 }); assert.equal(r.status, 200);
    r = await a.call('POST', '/api/tx/bulk', { put: [{ id: 't2', t: 'income', d: '2026-11-15', a: 'x', amt: 9, base: 9 }, { id: 't3', t: 'income', d: '2026-11-15', a: 'x', amt: 1, base: 1 }], del: [] }); assert.equal(r.status, 200);
    r = await a.call('PUT', '/api/tx/bad', { t: 'expense', d: 'yesterday' }); assert.equal(r.status, 400);
    r = await a.call('GET', '/api/state'); assert.equal(r.body.tx.length, 3); assert.equal(r.body.config.accounts[0].name, 'Mine'); const revA = r.body.rev;
    r = await a.call('DELETE', '/api/tx/t3'); assert.equal(r.body.rev, revA + 1);
    r = await b.call('GET', '/api/state'); assert.equal(r.body.tx.length, 0); assert.deepEqual(r.body.config, {});
    r = await b.call('PUT', '/api/tx/t1', { t: 'expense', d: '2026-11-01', amt: 5 }); assert.equal(r.status, 200);
    r = await a.call('GET', '/api/state'); assert.equal(r.body.tx.find(x => x.id === 't1').amt, 1500);

    // backup restore replaces everything
    r = await b.call('POST', '/api/restore', { config: { settings: {} }, drafts: { cards: {} }, movements: [{ id: 'r1', d: '2026-01-01', t: 'income', amt: 1 }] }); assert.equal(r.status, 200);
    r = await b.call('GET', '/api/state'); assert.deepEqual(r.body.tx.map(x => x.id), ['r1']);

    // password change, then old password no longer works
    r = await b.call('POST', '/api/auth/password', { current: 'temporary1', next: 'my own pass' }); assert.equal(r.status, 200);
    const b2 = client(); r = await b2.call('POST', '/api/auth/login', { email: mail('bea'), password: 'temporary1' }); assert.equal(r.status, 401);
    r = await b2.call('POST', '/api/auth/login', { email: mail('bea'), password: 'my own pass' }); assert.equal(r.status, 200);

    // the last administrator cannot be demoted; disabling a member ends their sessions
    const adminId = (await a.call('GET', '/api/users')).body.users.find(u => u.role === 'admin').id;
    r = await a.call('PATCH', '/api/users/' + adminId, { role: 'user' }); assert.equal(r.status, 400);
    r = await a.call('PATCH', '/api/users/' + bea.id, { disabled: true }); assert.equal(r.status, 200);
    r = await b2.call('GET', '/api/state'); assert.equal(r.status, 401);
    r = await b2.call('POST', '/api/auth/login', { email: mail('bea'), password: 'my own pass' }); assert.equal(r.status, 403);

    // sign out
    r = await a.call('POST', '/api/auth/logout', {}); assert.equal(r.status, 200);
    r = await a.call('GET', '/api/state'); assert.equal(r.status, 401);
    r = await a.call('POST', '/api/auth/login', { email: mail('admin'), password: 'correct horse' }); assert.equal(r.status, 200);
    r = await a.call('DELETE', '/api/users/' + bea.id); assert.equal(r.status, 200); assert.ok(!r.body.users.some(u => u.id === bea.id));
    r = await a.call('DELETE', '/api/users/' + adminId); assert.equal(r.status, 400);
    r = await fetch(BASE + '/healthz'); assert.equal(r.status, 200);
    console.log('All checks passed.');
  } finally { srv.kill(); }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
