import assert from 'node:assert/strict';
import { dbTest } from '../test-helpers/testDb.js';
import { migrate } from '../src/migrate.js';
import { seedBase } from '../src/seedData.js';
import { listUpcoming, getSlot, nextAvailable } from '../src/services/slotService.js';
import { createOrder, getOrder, listOrders, trackByCode, updateOrderStatus } from '../src/services/orderService.js';
import { predict, evaluate } from '../src/services/predictionService.js';
import { buildBriefData, templateBrief } from '../src/services/briefService.js';
import { addDays, todayISO } from '../src/utils/dates.js';

const order = (db, date, qty, pid = 1) =>
  createOrder(db, { customer_name: 'Tes', phone: '081234567890', delivery_address: 'Jl. Tes No. 1, Bekasi', delivery_date: date, items: [{ product_id: pid, quantity: qty }] });

// assert.rejects dengan pemeriksaan isi error
const rejectsWith = (promise, check) => assert.rejects(promise, check);

dbTest('migrasi aman dijalankan ulang dan seed tidak menggandakan data', async (db) => {
  assert.deepEqual(await migrate(db), []); // sudah dijalankan saat setup, tidak ada yang baru
  assert.equal(await seedBase(db), false);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM products')).n, 4);
});

dbTest('slot: hari aktif, override kapasitas, dan hari nonaktif', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  assert.equal(first.capacity, 50);
  await db.run('INSERT INTO slot_overrides (delivery_date, capacity) VALUES ($1, 80)', [first.delivery_date]);
  assert.equal((await getSlot(db, first.delivery_date)).capacity, 80);
  await db.run('UPDATE delivery_days SET active = FALSE WHERE weekday = $1', [first.weekday]);
  assert.equal(await getSlot(db, first.delivery_date), null);
});

dbTest('slot penuh menolak order baru dan menyarankan slot berikutnya', async (db) => {
  const [first, second] = await listUpcoming(db, { count: 2 });
  await order(db, first.delivery_date, first.capacity);
  assert.equal((await getSlot(db, first.delivery_date)).status, 'full');
  await rejectsWith(
    order(db, first.delivery_date, 1),
    (e) => e.status === 409 && e.code === 'SLOT_FULL' && e.details.next_available.delivery_date === second.delivery_date
  );
});

dbTest('order melebihi sisa kapasitas ditolak walau slot belum penuh', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  await order(db, first.delivery_date, first.capacity - 5);
  await rejectsWith(order(db, first.delivery_date, 6), (e) => e.code === 'INSUFFICIENT_CAPACITY');
  assert.equal((await order(db, first.delivery_date, 5)).total_quantity, 5);
});

dbTest('dua order bersamaan tidak bisa sama-sama melewati kapasitas', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const qty = first.capacity - 10; // masing-masing muat sendiri, tetapi berdua melebihi kapasitas
  const results = await Promise.allSettled([order(db, first.delivery_date, qty), order(db, first.delivery_date, qty)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const failed = results.find((r) => r.status === 'rejected');
  assert.equal(failed.reason.status, 409);
  assert.equal((await getSlot(db, first.delivery_date)).used, qty);
});

dbTest('banyak order bersamaan: total tidak pernah melewati kapasitas', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => order(db, first.delivery_date, 10)));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, Math.floor(first.capacity / 10));
  assert.ok((await getSlot(db, first.delivery_date)).used <= first.capacity);
});

dbTest('membatalkan order mengembalikan kapasitas slot', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const o = await order(db, first.delivery_date, first.capacity);
  await updateOrderStatus(db, o.id, 'Dibatalkan');
  assert.equal((await getSlot(db, first.delivery_date)).left, first.capacity);
});

dbTest('tanggal bukan hari pengiriman dan terlalu dekat ditolak', async (db) => {
  const sunday = (() => { let d = addDays(todayISO(), 3); while (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) d = addDays(d, 1); return d; })();
  await rejectsWith(order(db, sunday, 1), (e) => e.code === 'INVALID_SLOT');
  for (let w = 0; w < 7; w++) await db.run('INSERT INTO delivery_days (weekday, capacity) VALUES ($1, 50) ON CONFLICT DO NOTHING', [w]);
  await rejectsWith(order(db, todayISO(), 1), (e) => e.code === 'TOO_SOON');
});

dbTest('produk nonaktif tidak bisa dipesan, harga disimpan saat order dibuat', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const o = await order(db, first.delivery_date, 2, 1);
  assert.equal(o.items[0].unit_price, 48000);
  assert.equal(o.total_price, 96000);
  await db.run('UPDATE products SET price = 99000 WHERE id = 1');
  assert.equal((await getOrder(db, o.id)).items[0].unit_price, 48000); // order lama tidak berubah
  await db.run('UPDATE products SET active = FALSE WHERE id = 2');
  await rejectsWith(order(db, first.delivery_date, 1, 2), (e) => e.code === 'INVALID_PRODUCT');
});

dbTest('daftar order: filter tanggal/status, item ikut terbawa, dan lacak dengan kode', async (db) => {
  const [first, second] = await listUpcoming(db, { count: 2 });
  const a = await order(db, first.delivery_date, 3, 1);
  await order(db, second.delivery_date, 4, 2);
  await updateOrderStatus(db, a.id, 'Dikonfirmasi');

  const all = await listOrders(db, {});
  assert.equal(all.length, 2);
  assert.equal(all[0].items.length, 1);
  assert.equal((await listOrders(db, { date: second.delivery_date })).length, 1);
  assert.equal((await listOrders(db, { status: 'Dikonfirmasi' }))[0].id, a.id);
  await rejectsWith(listOrders(db, { status: 'Ngawur' }), (e) => e.status === 400);

  const tracked = await trackByCode(db, a.code.toLowerCase());
  assert.equal(tracked.status, 'Dikonfirmasi');
  assert.equal(tracked.items[0].quantity, 3);
  assert.equal(tracked.phone, undefined); // data pribadi tidak ikut
  await rejectsWith(trackByCode(db, 'TW-TIDAKADA'), (e) => e.status === 404);
});

dbTest('nextAvailable melewati slot yang tidak cukup', async (db) => {
  const [first, second, third] = await listUpcoming(db, { count: 3 });
  await order(db, second.delivery_date, second.capacity - 2);
  assert.equal((await nextAvailable(db, first.delivery_date, 5)).delivery_date, third.delivery_date);
  assert.equal((await nextAvailable(db, first.delivery_date, 1)).delivery_date, second.delivery_date);
});

dbTest('prediksi menghasilkan angka valid dan evaluasi terukur', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const p = await predict(db, first.delivery_date);
  assert.equal(p.per_product.length, 4);
  assert.ok(p.total_predicted > 0);
  assert.ok(p.per_product.every((x) => x.history_points === 16));
  const e = await evaluate(db);
  assert.ok(e.n_test > 0 && Number.isFinite(e.mae) && Number.isFinite(e.mape_percent));
});

dbTest('brief: slot penuh => target produksi sama dengan jumlah order terkonfirmasi', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const o = await order(db, first.delivery_date, first.capacity, 1);
  await updateOrderStatus(db, o.id, 'Dikonfirmasi');
  const d = await buildBriefData(db, first.delivery_date);
  assert.equal(d.total_target, first.capacity);
  assert.ok(d.warnings.some((w) => w.includes('Slot penuh')));
  assert.match(templateBrief(d), /PRODUCTION BRIEF/);
});

dbTest('brief: order Baru tidak masuk target tapi dilaporkan sebagai pending; konfirmasi memasukkannya', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const o = await order(db, first.delivery_date, first.capacity, 1); // slot penuh oleh order Baru
  let d = await buildBriefData(db, first.delivery_date);
  assert.equal(d.total_target, 0);
  assert.equal(d.pending_qty, first.capacity);
  assert.equal(d.pending_order_count, 1);
  assert.equal(d.used, first.capacity); // tetap memakai kapasitas slot
  assert.ok(d.warnings.some((w) => w.includes('belum masuk target')));
  assert.match(templateBrief(d), /belum dikonfirmasi/);

  await updateOrderStatus(db, o.id, 'Dikonfirmasi');
  d = await buildBriefData(db, first.delivery_date);
  assert.equal(d.total_target, first.capacity);
  assert.equal(d.pending_qty, 0);
  assert.equal(d.order_count, 1);
});

dbTest('brief: Diproduksi/Dikirim ikut terkonfirmasi, Dibatalkan tidak dihitung sama sekali', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const a = await order(db, first.delivery_date, 5, 1);
  const b = await order(db, first.delivery_date, 7, 2);
  const c = await order(db, first.delivery_date, 9, 3);
  await updateOrderStatus(db, a.id, 'Diproduksi');
  await updateOrderStatus(db, b.id, 'Dikirim');
  await updateOrderStatus(db, c.id, 'Dibatalkan');
  const d = await buildBriefData(db, first.delivery_date);
  assert.equal(d.confirmed_qty, 12);
  assert.equal(d.pending_qty, 0);
  assert.equal(d.order_count, 2);
  assert.equal(d.items.find((i) => i.product_id === 3).ordered, 0);
});

dbTest('mengaktifkan kembali order Dibatalkan dicek terhadap kapasitas slot', async (db) => {
  const [first, second] = await listUpcoming(db, { count: 2 });
  const a = await order(db, first.delivery_date, 30, 1);
  await updateOrderStatus(db, a.id, 'Dibatalkan');
  await order(db, first.delivery_date, first.capacity, 2); // slot terisi penuh oleh order lain
  await rejectsWith(
    updateOrderStatus(db, a.id, 'Baru'),
    (e) => e.status === 409 && e.code === 'INSUFFICIENT_CAPACITY' && e.details.next_available.delivery_date === second.delivery_date
  );
  assert.equal((await getSlot(db, first.delivery_date)).used, first.capacity); // tidak ada yang berubah
  assert.equal((await updateOrderStatus(db, a.id, 'Dibatalkan')).status, 'Dibatalkan');
});

dbTest('mengaktifkan kembali order Dibatalkan berhasil jika kapasitas cukup; ubah status biasa tidak dicek ulang', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const a = await order(db, first.delivery_date, 20, 1);
  await updateOrderStatus(db, a.id, 'Dibatalkan');
  assert.equal((await updateOrderStatus(db, a.id, 'Dikonfirmasi')).status, 'Dikonfirmasi');
  assert.equal((await getSlot(db, first.delivery_date)).used, 20);
  // slot penuh oleh order ini sendiri: pindah status Baru -> Dikonfirmasi tetap boleh
  const b = await order(db, first.delivery_date, first.capacity - 20, 2);
  assert.equal((await getSlot(db, first.delivery_date)).status, 'full');
  assert.equal((await updateOrderStatus(db, b.id, 'Dikonfirmasi')).status, 'Dikonfirmasi');
});

dbTest('transaksi dibatalkan seluruhnya jika ada error di tengah jalan', async (db) => {
  await rejectsWith(
    db.transaction(async (tx) => {
      await tx.run("INSERT INTO products (name, price) VALUES ('Percobaan', 1000)");
      assert.equal((await tx.get('SELECT COUNT(*) AS n FROM products')).n, 5); // terlihat di dalam transaksi
      throw new Error('boom');
    }),
    /boom/
  );
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM products')).n, 4); // tidak ada yang tersimpan
});

dbTest('order dengan produk tidak valid tidak meninggalkan data apa pun', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  await rejectsWith(
    createOrder(db, { customer_name: 'Tes', phone: '081234567890', delivery_address: 'Jl. Tes No. 1, Bekasi', delivery_date: first.delivery_date, items: [{ product_id: 1, quantity: 2 }, { product_id: 999, quantity: 1 }] }),
    (e) => e.code === 'INVALID_PRODUCT'
  );
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM orders')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM order_items')).n, 0);
});

dbTest('order menyimpan alamat pengiriman; alamat wajib diisi dan tampil di daftar order', async (db) => {
  const [first] = await listUpcoming(db, { count: 1 });
  const o = await order(db, first.delivery_date, 2);
  assert.equal(o.delivery_address, 'Jl. Tes No. 1, Bekasi');
  assert.equal((await getOrder(db, o.id)).delivery_address, 'Jl. Tes No. 1, Bekasi');
  assert.equal((await listOrders(db, { date: first.delivery_date }))[0].delivery_address, 'Jl. Tes No. 1, Bekasi');

  const base = { customer_name: 'Tes', phone: '081234567890', delivery_date: first.delivery_date, items: [{ product_id: 1, quantity: 1 }] };
  for (const address of [undefined, '', '   ', 'abc', 'x'.repeat(301)]) {
    await rejectsWith(createOrder(db, { ...base, delivery_address: address }), (e) => e.status === 400 && e.code === 'VALIDATION_ERROR');
  }
  // alamat tidak muncul di endpoint publik pelacakan
  assert.equal('delivery_address' in (await trackByCode(db, o.code)), false);
});

dbTest('seedDemoOrders membuat order contoh lengkap dengan alamat dan status, aman dijalankan ulang', async (db) => {
  const { seedDemoOrders } = await import('../src/seedData.js');
  const first = await seedDemoOrders(db);
  assert.equal(first.created, 7);
  const all = await listOrders(db);
  assert.ok(all.every((o) => o.delivery_address.length >= 5));
  assert.ok(['Baru', 'Dikonfirmasi', 'Dibatalkan'].every((st) => all.some((o) => o.status === st)));
  const second = await seedDemoOrders(db); // slot terdekat sudah penuh -> dilewati, tidak error
  assert.ok(second.skipped > 0);
});
