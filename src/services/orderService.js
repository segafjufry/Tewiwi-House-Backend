import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { reqDate, reqInt, reqPhone, reqString } from '../utils/validate.js';
import { earliestDate, getSlot, nextAvailable } from './slotService.js';

export const STATUSES = ['Baru', 'Dikonfirmasi', 'Diproduksi', 'Dikirim', 'Dibatalkan'];
// Order yang sudah dikonfirmasi admin = dasar production brief. 'Baru' tetap memakai kapasitas slot.
export const CONFIRMED_STATUSES = ['Dikonfirmasi', 'Diproduksi', 'Dikirim'];

function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items wajib berisi minimal satu produk');
  }
  const merged = new Map(); // gabungkan product_id yang dobel
  for (const it of raw) {
    const pid = reqInt(it?.product_id, 'product_id', { min: 1 });
    const qty = reqInt(it?.quantity, 'quantity', { min: 1, max: 1000 });
    merged.set(pid, (merged.get(pid) || 0) + qty);
  }
  return [...merged].map(([product_id, quantity]) => ({ product_id, quantity }));
}

// Satu query untuk order + item-nya (tanpa N+1). `where` hanya berisi potongan SQL tetap dari kode ini.
async function fetchOrders(db, where, params) {
  const rows = await db.all(
    `SELECT o.id, o.code, o.customer_name, o.phone, o.delivery_address, o.delivery_date, o.status, o.created_at,
            i.product_id, p.name AS product_name, i.quantity, i.unit_price
     FROM orders o
     LEFT JOIN order_items i ON i.order_id = o.id
     LEFT JOIN products p ON p.id = i.product_id
     ${where}
     ORDER BY o.delivery_date, o.id, i.id`,
    params
  );
  const orders = new Map();
  for (const r of rows) {
    let o = orders.get(r.id);
    if (!o) {
      o = {
        id: r.id,
        code: r.code,
        customer_name: r.customer_name,
        phone: r.phone,
        delivery_address: r.delivery_address,
        delivery_date: r.delivery_date,
        status: r.status,
        created_at: r.created_at,
        items: [],
      };
      orders.set(r.id, o);
    }
    if (r.product_id !== null) {
      o.items.push({ product_id: r.product_id, name: r.product_name, quantity: r.quantity, unit_price: r.unit_price });
    }
  }
  return [...orders.values()].map((o) => ({
    ...o,
    total_quantity: o.items.reduce((a, b) => a + b.quantity, 0),
    total_price: o.items.reduce((a, b) => a + b.quantity * b.unit_price, 0),
  }));
}

export async function getOrder(db, id) {
  const [order] = await fetchOrders(db, 'WHERE o.id = $1', [id]);
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order tidak ditemukan');
  return order;
}

export async function listOrders(db, { date, status } = {}) {
  const where = [];
  const params = [];
  if (date) {
    params.push(reqDate(date, 'date'));
    where.push(`o.delivery_date = $${params.length}`);
  }
  if (status) {
    if (!STATUSES.includes(status)) throw new AppError(400, 'VALIDATION_ERROR', `status harus salah satu dari ${STATUSES.join(', ')}`);
    params.push(status);
    where.push(`o.status = $${params.length}`);
  }
  return fetchOrders(db, where.length ? `WHERE ${where.join(' AND ')}` : '', params);
}

const slotLock = (date) => `slot:${date}`;

/**
 * Membuat order. Pengecekan kapasitas dan penyimpanan terjadi dalam SATU transaksi, dan transaksi untuk
 * tanggal yang sama dikunci (advisory lock) supaya berjalan bergantian. Jadi dua pelanggan yang memesan
 * bersamaan tidak bisa sama-sama melewati kapasitas.
 */
export async function createOrder(db, input) {
  const body = input ?? {};
  const customer_name = reqString(body.customer_name, 'customer_name');
  const phone = reqPhone(body.phone);
  const delivery_address = reqString(body.delivery_address, 'delivery_address', { min: 5, max: 300 });
  const delivery_date = reqDate(body.delivery_date, 'delivery_date');
  const items = parseItems(body.items);

  for (let attempt = 1; ; attempt++) {
    try {
      const orderId = await db.transaction(async (tx) => {
        await tx.lock(slotLock(delivery_date));

        const slot = await getSlot(tx, delivery_date);
        if (!slot) throw new AppError(422, 'INVALID_SLOT', 'Tanggal tersebut bukan hari pengiriman');
        if (delivery_date < earliestDate()) {
          throw new AppError(422, 'TOO_SOON', `Pemesanan minimal ${earliestDate()} (produksi H-2)`);
        }

        const priced = [];
        for (const it of items) {
          const p = await tx.get('SELECT id, price FROM products WHERE id = $1 AND active', [it.product_id]);
          if (!p) throw new AppError(422, 'INVALID_PRODUCT', `Produk ${it.product_id} tidak tersedia`);
          priced.push({ ...it, unit_price: p.price });
        }

        const total = priced.reduce((a, b) => a + b.quantity, 0);
        if (slot.left < total) {
          const next = await nextAvailable(tx, delivery_date, total);
          throw new AppError(
            409,
            slot.left === 0 ? 'SLOT_FULL' : 'INSUFFICIENT_CAPACITY',
            slot.left === 0 ? 'Slot sudah penuh' : `Sisa kapasitas slot hanya ${slot.left} roti`,
            { slot, next_available: next }
          );
        }

        const code = 'TW-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const order = await tx.get(
          'INSERT INTO orders (code, customer_name, phone, delivery_address, delivery_date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [code, customer_name, phone, delivery_address, delivery_date]
        );
        for (const it of priced) {
          await tx.run('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [
            order.id,
            it.product_id,
            it.quantity,
            it.unit_price,
          ]);
        }
        return order.id;
      });
      return await getOrder(db, orderId);
    } catch (err) {
      // 23505 = unique_violation: kode order kebetulan kembar (sangat jarang). Ulangi dengan kode baru.
      if (err.code === '23505' && attempt < 3) continue;
      throw err;
    }
  }
}

export async function updateOrderStatus(db, id, status) {
  if (!STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status harus salah satu dari ${STATUSES.join(', ')}`);
  }
  // Cek + ubah dalam satu transaksi dengan kunci slot yang sama seperti createOrder.
  await db.transaction(async (tx) => {
    const peek = await tx.get('SELECT delivery_date FROM orders WHERE id = $1', [id]);
    if (!peek) throw new AppError(404, 'NOT_FOUND', 'Order tidak ditemukan');
    await tx.lock(slotLock(peek.delivery_date)); // tanggal pengiriman order tidak pernah berubah
    const current = await tx.get('SELECT status, delivery_date FROM orders WHERE id = $1', [id]);

    // Mengaktifkan kembali order yang dibatalkan = memakai kapasitas slot lagi, jadi harus dicek ulang.
    if (current.status === 'Dibatalkan' && status !== 'Dibatalkan') {
      const slot = await getSlot(tx, current.delivery_date);
      if (!slot) throw new AppError(422, 'INVALID_SLOT', 'Tanggal order ini sudah bukan hari pengiriman');
      const { qty } = await tx.get('SELECT COALESCE(SUM(quantity), 0) AS qty FROM order_items WHERE order_id = $1', [id]);
      if (slot.left < qty) {
        throw new AppError(409, 'INSUFFICIENT_CAPACITY', `Order tidak bisa diaktifkan lagi: butuh ${qty} roti, sisa kapasitas slot ${slot.left}`, {
          slot,
          next_available: await nextAvailable(tx, current.delivery_date, qty),
        });
      }
    }
    await tx.run('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  });
  return getOrder(db, id); // status Dibatalkan otomatis mengembalikan kapasitas slot
}

export async function trackByCode(db, code) {
  const [o] = await fetchOrders(db, 'WHERE o.code = $1', [String(code).toUpperCase()]);
  if (!o) throw new AppError(404, 'NOT_FOUND', 'Kode order tidak ditemukan');
  return { code: o.code, delivery_date: o.delivery_date, status: o.status, items: o.items, total_price: o.total_price };
}
