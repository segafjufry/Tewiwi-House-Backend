import test from 'node:test';
import assert from 'node:assert/strict';

// Env harus diset sebelum config.js dimuat (dotenv tidak menimpa env yang sudah ada)
process.env.ADMIN_API_KEY = 'kunci-tes-yang-cukup-panjang-123';
const { loadConfig, ConfigError } = await import('../src/config.js');
const { createLimiter, rateLimit } = await import('../src/middleware/rateLimit.js');
const { adminOnly, isAdmin } = await import('../src/middleware/adminAuth.js');
const { securityHeaders } = await import('../src/middleware/security.js');

const GOOD_KEY = 'a'.repeat(32);
const DB_URL = 'postgresql://tewiwi:rahasia@db.contoh.com:5432/tewiwi';
const prodEnv = (over = {}) => ({ NODE_ENV: 'production', ADMIN_API_KEY: GOOD_KEY, CORS_ORIGIN: 'https://app.contoh.com', DATABASE_URL: DB_URL, ...over });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- config ----------
test('config: mode development boleh memakai nilai default', () => {
  const c = loadConfig({});
  assert.equal(c.isProd, false);
  assert.equal(c.host, '0.0.0.0');
  assert.deepEqual(c.corsOrigins, ['http://localhost:5173']);
  assert.match(c.db.url, /^postgresql:\/\/.*localhost/);
  assert.equal(c.db.ssl, 'disable');
});

test('config: produksi menolak admin key kosong, default, atau pendek', () => {
  for (const key of [undefined, 'dev-admin-key', 'pendek']) {
    assert.throws(() => loadConfig(prodEnv({ ADMIN_API_KEY: key })), (e) => e instanceof ConfigError && /ADMIN_API_KEY/.test(e.message));
  }
});

test('config: produksi menolak CORS_ORIGIN kosong atau "*", dan melaporkan semua masalah sekaligus', () => {
  assert.throws(() => loadConfig(prodEnv({ CORS_ORIGIN: '' })), /CORS_ORIGIN/);
  assert.throws(() => loadConfig(prodEnv({ CORS_ORIGIN: '*' })), /CORS_ORIGIN/);
  try {
    loadConfig({ NODE_ENV: 'production' });
    assert.fail('seharusnya melempar error');
  } catch (e) {
    assert.equal(e.problems.length, 3); // admin key, CORS, dan DATABASE_URL
  }
});

test('config: DATABASE_URL wajib di produksi, tidak boleh memuat sslmode, harus valid', () => {
  assert.throws(() => loadConfig(prodEnv({ DATABASE_URL: '' })), /DATABASE_URL belum diisi/);
  assert.throws(() => loadConfig(prodEnv({ DATABASE_URL: DB_URL + '?sslmode=require' })), /sslmode/);
  assert.throws(() => loadConfig(prodEnv({ DATABASE_URL: 'bukan url' })), /DATABASE_URL tidak valid/);
});

test('config: DATABASE_SSL divalidasi, default verify di produksi, dan ada peringatan untuk pengaturan lemah', () => {
  assert.throws(() => loadConfig({ DATABASE_SSL: 'sembarang' }), /DATABASE_SSL/); // juga di development
  assert.equal(loadConfig(prodEnv()).db.ssl, 'verify');
  assert.equal(loadConfig(prodEnv()).warnings.length, 0);
  assert.equal(loadConfig(prodEnv({ DATABASE_SSL: 'require' })).warnings.length, 1);
  assert.equal(loadConfig(prodEnv({ DATABASE_SSL: 'disable' })).warnings.length, 1); // host bukan localhost
  const local = loadConfig(prodEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/tewiwi', DATABASE_SSL: 'disable' }));
  assert.equal(local.warnings.length, 0);
  assert.equal(loadConfig(prodEnv({ DB_POOL_MAX: '25', DATABASE_SSL_CA: '/etc/ca.pem' })).db.poolMax, 25);
});

test('config: produksi valid, host default hanya lokal, CORS bisa lebih dari satu', () => {
  const c = loadConfig(prodEnv({ CORS_ORIGIN: 'https://a.com, https://b.com', TRUST_PROXY: '1', RATE_LIMIT_ORDERS: '5' }));
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.trustProxy, 1);
  assert.deepEqual(c.corsOrigins, ['https://a.com', 'https://b.com']);
  assert.equal(c.rateLimit.createOrder.max, 5);
  assert.equal(loadConfig(prodEnv({ HOST: '0.0.0.0' })).host, '0.0.0.0');
});

// ---------- rate limiter ----------
test('limiter: melewati batas -> limited, IP lain tidak terpengaruh', () => {
  const l = createLimiter({ windowMs: 10_000, max: 3 });
  for (let i = 0; i < 3; i++) assert.equal(l.hit('1.1.1.1').limited, false);
  assert.equal(l.hit('1.1.1.1').limited, true);
  assert.equal(l.hit('2.2.2.2').limited, false);
  l.stop();
});

test('limiter: hitungan direset setelah jendela waktu lewat', async () => {
  const l = createLimiter({ windowMs: 40, max: 1 });
  l.hit('x');
  assert.equal(l.hit('x').limited, true);
  await sleep(60);
  assert.equal(l.hit('x').limited, false);
  l.stop();
});

test('rateLimit middleware: melempar 429 + header Retry-After', () => {
  const l = createLimiter({ windowMs: 10_000, max: 1 });
  const mw = rateLimit(l);
  const headers = {};
  const res = { set: (k, v) => (headers[k] = v) };
  let nexted = 0;
  mw({ ip: '9.9.9.9' }, res, () => nexted++);
  assert.equal(nexted, 1);
  assert.throws(() => mw({ ip: '9.9.9.9' }, res, () => nexted++), (e) => e.status === 429 && e.code === 'RATE_LIMITED');
  assert.ok(Number(headers['Retry-After']) > 0);
  l.stop();
});

// ---------- admin auth ----------
const fakeReq = (key, limiter, ip = '5.5.5.5') => ({
  ip,
  get: (h) => (h.toLowerCase() === 'x-admin-key' ? key : undefined),
  app: { locals: { adminFailLimiter: limiter } },
});
const fakeRes = () => ({ set() {} });

test('adminOnly: key benar lolos, salah 401, tanpa key 401', () => {
  const l = createLimiter({ windowMs: 10_000, max: 5 });
  let ok = 0;
  adminOnly(fakeReq(process.env.ADMIN_API_KEY, l), fakeRes(), () => ok++);
  assert.equal(ok, 1);
  assert.throws(() => adminOnly(fakeReq('salah', l), fakeRes(), () => {}), (e) => e.status === 401);
  assert.throws(() => adminOnly(fakeReq(undefined, l), fakeRes(), () => {}), (e) => e.status === 401);
  l.stop();
});

test('adminOnly: terlalu banyak key salah -> IP diblokir 429, IP lain tetap bisa', () => {
  const l = createLimiter({ windowMs: 10_000, max: 3 });
  for (let i = 0; i < 3; i++) {
    assert.throws(() => adminOnly(fakeReq('salah', l), fakeRes(), () => {}), (e) => e.status === 401);
  }
  // sekarang diblokir, bahkan dengan key yang benar
  assert.throws(() => adminOnly(fakeReq(process.env.ADMIN_API_KEY, l), fakeRes(), () => {}), (e) => e.status === 429);
  let ok = 0;
  adminOnly(fakeReq(process.env.ADMIN_API_KEY, l, '6.6.6.6'), fakeRes(), () => ok++);
  assert.equal(ok, 1);
  l.stop();
});

test('isAdmin: key salah juga dihitung (GET /products?all=true tidak bisa dipakai menebak key)', () => {
  const l = createLimiter({ windowMs: 10_000, max: 2 });
  assert.equal(isAdmin(fakeReq('salah1', l)), false);
  assert.equal(isAdmin(fakeReq('salah2', l)), false);
  assert.equal(isAdmin(fakeReq(process.env.ADMIN_API_KEY, l)), false); // sudah diblokir
  assert.equal(isAdmin(fakeReq(undefined, l, '7.7.7.7')), false); // tanpa key bukan percobaan gagal
  l.stop();
});

// ---------- security headers ----------
test('securityHeaders: HSTS hanya di produksi', () => {
  const collect = (hsts) => {
    const h = {};
    const res = { set: (a, b) => (typeof a === 'object' ? Object.assign(h, a) : (h[a] = b)) };
    securityHeaders({ hsts })({}, res, () => {});
    return h;
  };
  assert.equal(collect(false)['X-Content-Type-Options'], 'nosniff');
  assert.equal(collect(false)['Cache-Control'], 'no-store');
  assert.equal(collect(false)['Strict-Transport-Security'], undefined);
  assert.ok(collect(true)['Strict-Transport-Security'].includes('max-age'));
});
