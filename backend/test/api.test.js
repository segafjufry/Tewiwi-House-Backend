// Tes integrasi: menjalankan server Express sungguhan di port acak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

const KEY = 'kunci-integrasi-yang-cukup-panjang-1';
process.env.ADMIN_API_KEY = KEY; // dibaca oleh middleware adminAuth
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/app.js');
const { createTestDb, skip } = await import('../test-helpers/testDb.js');

async function startServer(limits = {}) {
  const cfg = loadConfig({
    NODE_ENV: 'production',
    ADMIN_API_KEY: KEY,
    CORS_ORIGIN: 'https://app.contoh.com',
    DATABASE_URL: 'postgresql://u:p@db.contoh.com:5432/tewiwi',
  });
  Object.assign(cfg.rateLimit, limits);
  const { db, cleanup } = await createTestDb();
  const server = createApp(db, cfg).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: async () => { server.closeAllConnections(); server.close(); await cleanup(); },
  };
}
const postJson = (url, body, headers = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('health + header keamanan, tanpa x-powered-by', { skip }, async () => {
  const s = await startServer();
  try {
    const res = await fetch(`${s.base}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('strict-transport-security'));
    assert.equal(res.headers.get('x-powered-by'), null);
  } finally { await s.close(); }
});

test('URL /api yang tidak ada = 404; endpoint admin tanpa key = 401', { skip }, async () => {
  const s = await startServer();
  try {
    assert.equal((await fetch(`${s.base}/api/tidak-ada`)).status, 404);
    assert.equal((await postJson(`${s.base}/api/predict`, {})).status, 401);
  } finally { await s.close(); }
});

test('CORS hanya untuk origin frontend yang diizinkan', { skip }, async () => {
  const s = await startServer();
  try {
    const ok = await fetch(`${s.base}/api/products`, { headers: { origin: 'https://app.contoh.com' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.contoh.com');
    const bad = await fetch(`${s.base}/api/products`, { headers: { origin: 'https://jahat.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  } finally { await s.close(); }
});

test('POST /api/orders dibatasi per IP (429 setelah batas)', { skip }, async () => {
  const s = await startServer({ createOrder: { windowMs: 60_000, max: 2 } });
  try {
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await postJson(`${s.base}/api/orders`, {})).status);
    assert.deepEqual(codes, [400, 400, 429]);
  } finally { await s.close(); }
});

test('menebak admin key berulang -> diblokir 429', { skip }, async () => {
  const s = await startServer({ adminFail: { windowMs: 60_000, max: 3 } });
  try {
    for (let i = 0; i < 3; i++) {
      assert.equal((await fetch(`${s.base}/api/orders`, { headers: { 'x-admin-key': 'salah' } })).status, 401);
    }
    assert.equal((await fetch(`${s.base}/api/orders`, { headers: { 'x-admin-key': KEY } })).status, 429);
  } finally { await s.close(); }
});

test('body JSON terlalu besar ditolak 413', { skip }, async () => {
  const s = await startServer();
  try {
    const res = await postJson(`${s.base}/api/orders`, { customer_name: 'x'.repeat(200_000) });
    assert.equal(res.status, 413);
  } finally { await s.close(); }
});

test('CRUD produk: validasi boolean, produk yang sudah dipakai order tidak bisa dihapus', { skip }, async () => {
  const s = await startServer();
  try {
    const admin = { 'x-admin-key': KEY };
    const created = await postJson(`${s.base}/api/products`, { name: 'Baguette', price: 25000, flour_grams: 200 }, admin);
    assert.equal(created.status, 201);
    const product = (await created.json()).data;
    assert.equal(product.active, true);

    const bad = await fetch(`${s.base}/api/products/${product.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json', ...admin }, body: JSON.stringify({ active: 'false' }),
    });
    assert.equal(bad.status, 400); // string "false" tidak boleh dianggap true

    const off = await fetch(`${s.base}/api/products/${product.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json', ...admin }, body: JSON.stringify({ active: false }),
    });
    assert.equal((await off.json()).data.active, false);
    const publicList = (await (await fetch(`${s.base}/api/products`)).json()).data;
    assert.ok(!publicList.some((p) => p.id === product.id)); // nonaktif tidak tampil untuk publik

    // produk 1 sudah ada di data historis -> tidak bisa dihapus (foreign key)
    const del = await fetch(`${s.base}/api/products/1`, { method: 'DELETE', headers: admin });
    assert.equal(del.status, 409);
    assert.equal((await fetch(`${s.base}/api/products/${product.id}`, { method: 'DELETE', headers: admin })).status, 204);
  } finally { await s.close(); }
});

test('alur order lewat HTTP: slot penuh -> 409 + saran slot; ubah kapasitas; rekap', { skip }, async () => {
  const s = await startServer();
  try {
    const admin = { 'x-admin-key': KEY };
    const slots = (await (await fetch(`${s.base}/api/slots?count=2`)).json()).data;
    const [first, second] = slots;
    const body = (qty) => ({ customer_name: 'Tes', phone: '081234567890', delivery_address: 'Jl. Tes No. 1, Bekasi', delivery_date: first.delivery_date, items: [{ product_id: 1, quantity: qty }] });

    assert.equal((await postJson(`${s.base}/api/orders`, body(first.capacity))).status, 201);
    const full = await postJson(`${s.base}/api/orders`, body(1));
    assert.equal(full.status, 409);
    assert.equal((await full.json()).error.details.next_available.delivery_date, second.delivery_date);
    const listed = (await (await fetch(`${s.base}/api/slots?count=1`)).json()).data[0];
    assert.equal(listed.status, 'full');
    assert.equal(listed.next_available.delivery_date, second.delivery_date);

    // admin menaikkan kapasitas -> slot terbuka lagi; kapasitas di bawah jumlah order ditolak
    const put = (cap) => fetch(`${s.base}/api/slots/${first.delivery_date}/capacity`, {
      method: 'PUT', headers: { 'content-type': 'application/json', ...admin }, body: JSON.stringify({ capacity: cap }),
    });
    assert.equal((await put(10)).status, 422);
    assert.equal((await put(first.capacity + 20)).status, 200);
    assert.equal((await postJson(`${s.base}/api/orders`, body(5))).status, 201);

    const recap = (await (await fetch(`${s.base}/api/production/recap`, { headers: admin })).json()).data;
    assert.equal(recap[0].total_quantity, first.capacity + 5);
    assert.equal(recap[0].slot.capacity, first.capacity + 20);
    assert.equal((await fetch(`${s.base}/api/production/recap?from=2026-01-01&to=2030-01-01`, { headers: admin })).status, 400);
  } finally { await s.close(); }
});

test('POST /api/orders mengembalikan order + info pembayaran; alamat wajib', { skip }, async () => {
  const s = await startServer();
  try {
    const [first] = (await (await fetch(`${s.base}/api/slots?count=1`)).json()).data;
    const body = { customer_name: 'Dewi', phone: '081234567890', delivery_address: 'Jl. Melati No. 12, Bekasi', delivery_date: first.delivery_date, items: [{ product_id: 1, quantity: 2 }] };

    const noAddr = await postJson(`${s.base}/api/orders`, { ...body, delivery_address: undefined });
    assert.equal(noAddr.status, 400);

    const res = await postJson(`${s.base}/api/orders`, body);
    assert.equal(res.status, 201);
    const { data } = await res.json();
    assert.equal(data.delivery_address, 'Jl. Melati No. 12, Bekasi');
    assert.equal(data.payment.amount, data.total_price);
    assert.equal(data.payment.transfer_note, data.code);
    assert.equal(data.payment.whatsapp_url, null); // ADMIN_WHATSAPP belum diatur di config tes
  } finally { await s.close(); }
});
