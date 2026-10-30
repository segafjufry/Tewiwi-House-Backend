import { addDays, todayISO, weekdayOf } from './utils/dates.js';
import { valuesList } from './db.js';
import { listUpcoming } from './services/slotService.js';
import { createOrder, updateOrderStatus } from './services/orderService.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Data dasar: produk, hari pengiriman, dan 16 minggu histori sintetis (Selasa & Jumat).
// Hanya mengisi jika tabel produk masih kosong, dan aman jika dua proses menjalankannya bersamaan.
export async function seedBase(db) {
  return db.transaction(async (tx) => {
    await tx.lock('tewiwi:seed');
    if ((await tx.get('SELECT COUNT(*) AS n FROM products')).n > 0) return false;

    const products = [
      // [name, price, flour_grams, [base_selasa, base_jumat]]
      ['Espresso Fudgy Brownies S (10x5)',           18000,  60, [8,  9]],
      ['Espresso Fudgy Brownies L (10x20)',           62000, 220, [3,  4]],
      ['Blueberry Cheese Crumble',                   23000,  90, [10, 12]],
      ['Korean Garlic Creamcheese',                  20000,  85, [9,  11]],
      ['Cranberry Walnut Creamcheese',               23000,  90, [10, 11]],
      ['Dusty Choco Hazelnut',                       23000,  90, [9,  10]],
      ['Paket Alit (Semua Varian)',                  60000, 300, [5,   6]],
      ['Salt Bread Original',                        18000,  80, [11, 13]],
      ['Sei Cheese Salt Bread (Sei Sapi + Cheese)',  23000,  95, [8,   9]],
      ['Shokupan Loaf (Roti Tawar)',                 25000, 200, [6,   7]],
      ['Country Bread',                              38000, 280, [5,   6]],
    ];

    const inserted = []; // { id, base: [selasa, jumat] }
    for (const [name, price, flour, base] of products) {
      const row = await tx.get('INSERT INTO products (name, price, flour_grams) VALUES ($1, $2, $3) RETURNING id', [name, price, flour]);
      inserted.push({ id: row.id, base });
    }
    await tx.run('INSERT INTO delivery_days (weekday, capacity) VALUES (2, 50), (5, 50)'); // Selasa & Jumat

    // Bangun order_history sintetis 16 minggu ke belakang berdasarkan pola demand tiap produk.
    const rand = rng(42);
    const params = [];
    let t = 0;
    for (let d = addDays(todayISO(), -112); d < todayISO(); d = addDays(d, 1)) {
      const wd = weekdayOf(d);
      if (wd !== 2 && wd !== 5) continue;
      for (const { id, base } of inserted) {
        const baseQty = base[wd === 2 ? 0 : 1];
        // Tren naik 1% per sesi + noise ±3, minimum 1
        const qty = Math.max(1, Math.round(baseQty * (1 + 0.01 * t) + (rand() - 0.5) * 6));
        params.push(d, id, qty);
      }
      t++;
    }
    await tx.run(`INSERT INTO order_history (delivery_date, product_id, quantity) VALUES ${valuesList(params.length / 3, 3)}`, params);
    return true;
  });
}

// Order contoh (lengkap dengan alamat pengiriman dan beragam status). Slot terdekat dibuat penuh supaya
// mekanisme "arahkan ke slot berikutnya" terlihat. Jika slot sudah tidak cukup (mis. dijalankan dua kali),
// order itu dilewati, bukan error. Mengembalikan { created, skipped }.
export async function seedDemoOrders(db) {
  const [first, second, third] = await listUpcoming(db, { count: 3 });
  const ids = (await db.all('SELECT id FROM products ORDER BY id')).map((r) => r.id);
  const [brownieS, brownieL, blueberryCheese, koreanGarlic, cranberryWalnut, dustyChoco, paketAlit, saltBread, seiCheese, shokupan, countryBread] = ids;

  const demo = [
    { name: 'Dewi', phone: '081234567890', address: 'Jl. Melati No. 12, RT 03/RW 05, Bekasi Selatan', slot: first, status: 'Dikonfirmasi',
      items: [[koreanGarlic, 10], [blueberryCheese, 8]] },
    { name: 'Raka', phone: '081298765432', address: 'Perumahan Griya Asri Blok C5 No. 7, Bekasi Timur', slot: first, status: 'Dikonfirmasi',
      items: [[saltBread, 12], [dustyChoco, 6]] },
    { name: 'Sinta', phone: '085711122233', address: 'Apartemen Green Bay Tower B Lt. 12 No. 1208, Pluit, Jakarta Utara', slot: first, status: 'Baru',
      items: [[countryBread, first.capacity - 40]] },
    { name: 'Laras', phone: '081377788899', address: 'Jl. Kenanga Raya No. 45, Jatiasih, Bekasi', slot: second, status: 'Baru',
      items: [[cranberryWalnut, 5], [seiCheese, 6]] },
    { name: 'Budi', phone: '087812345678', address: 'Jl. Cempaka Putih Tengah II No. 9, Jakarta Pusat', slot: second, status: 'Dikonfirmasi',
      items: [[shokupan, 4], [paketAlit, 2]] },
    { name: 'Andi', phone: '082111222333', address: 'Jl. Pahlawan No. 21, Rawalumbu, Bekasi', slot: second, status: 'Dibatalkan',
      items: [[brownieS, 3]] },
    { name: 'Maya', phone: '089655566677', address: 'Jl. Raya Pondok Gede No. 88, Bekasi', slot: third, status: 'Baru',
      items: [[brownieL, 2], [saltBread, 5], [koreanGarlic, 4]] },
  ];

  // Status yang dianggap "selesai" — order ini layak masuk order_history sebagai data nyata
  const COMPLETED = new Set(['Dikonfirmasi', 'Diproduksi', 'Dikirim']);

  let created = 0;
  let skipped = 0;
  for (const d of demo) {
    try {
      const order = await createOrder(db, {
        customer_name: d.name,
        phone: d.phone,
        delivery_address: d.address,
        delivery_date: d.slot.delivery_date,
        items: d.items.map(([product_id, quantity]) => ({ product_id, quantity })),
      });
      if (d.status !== 'Baru') await updateOrderStatus(db, order.id, d.status);

      // Catat ke order_history agar prediksi model bisa memakai data order nyata ini
      if (COMPLETED.has(d.status)) {
        for (const [product_id, quantity] of d.items) {
          await db.run(
            'INSERT INTO order_history (delivery_date, product_id, quantity) VALUES ($1, $2, $3)',
            [d.slot.delivery_date, product_id, quantity]
          );
        }
      }

      created++;
    } catch (err) {
      if (err.status === 409 || err.status === 422 || err.statusCode === 409 || err.statusCode === 422) skipped++;
      else throw err;
    }
  }
  return { created, skipped };
}
