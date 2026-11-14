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

    // { name, price, flour_grams, base: [selasa, jumat], description, image_url }
    const products = [
      { name: 'Espresso Fudgy Brownies S (10x5)',          price: 18000, flour:  60, base: [8,  9],
        description: 'Brownies fudgy espresso ukuran kecil, padat dan lembap dengan rasa kopi yang pas.', image_url: '' },
      { name: 'Espresso Fudgy Brownies L (10x20)',          price: 62000, flour: 220, base: [3,  4],
        description: 'Brownies fudgy espresso ukuran besar, cocok untuk berbagi dengan keluarga.', image_url: '' },
      { name: 'Blueberry Cheese Crumble',                   price: 23000, flour:  90, base: [10, 12],
        description: 'Roti dengan isian blueberry, taburan keju, dan crumble renyah di atasnya.', image_url: '' },
      { name: 'Korean Garlic Creamcheese',                  price: 20000, flour:  85, base: [9,  11],
        description: 'Roti garlic ala Korea dengan filling creamcheese yang gurih dan creamy.', image_url: '' },
      { name: 'Cranberry Walnut Creamcheese',               price: 23000, flour:  90, base: [10, 11],
        description: 'Roti creamcheese dengan cranberry asam dan kacang walnut yang renyah.', image_url: '' },
      { name: 'Dusty Choco Hazelnut',                       price: 23000, flour:  90, base: [9,  10],
        description: 'Roti berlapis cokelat dan hazelnut dengan taburan dusty sugar.', image_url: '' },
      { name: 'Paket Alit (Semua Varian)',                  price: 60000, flour: 300, base: [5,   6],
        description: 'Paket assortmen berisi berbagai varian roti signature Tewiwi.', image_url: '' },
      { name: 'Salt Bread Original',                        price: 18000, flour:  80, base: [11, 13],
        description: 'Roti salt bread klasik dengan kulit renyah dan bagian dalam empuk berminyak.', image_url: '' },
      { name: 'Sei Cheese Salt Bread (Sei Sapi + Cheese)',  price: 23000, flour:  95, base: [8,   9],
        description: 'Salt bread dengan isian sei sapi dan keju yang gurih dan menggugah selera.', image_url: '' },
      { name: 'Shokupan Loaf (Roti Tawar)',                 price: 25000, flour: 200, base: [6,   7],
        description: 'Roti tawar Jepang (shokupan) yang lembut, empuk, dan serbaguna.', image_url: '' },
      { name: 'Country Bread',                             price: 38000, flour: 280, base: [5,   6],
        description: 'Roti country bread artisan dengan kulit tebal dan remah yang kenyal.', image_url: '' },
    ];

    const inserted = []; // { id, base: [selasa, jumat] }
    for (const p of products) {
      const row = await tx.get(
        'INSERT INTO products (name, price, flour_grams, description, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [p.name, p.price, p.flour, p.description, p.image_url]
      );
      inserted.push({ id: row.id, base: p.base });
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
