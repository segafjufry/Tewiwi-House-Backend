// Pakai: npm run seed           -> isi data contoh jika database masih kosong
//        npm run seed:reset     -> HAPUS SEMUA DATA lalu isi ulang (ditolak di produksi)
//        npm run seed:orders    -> TAMBAH order contoh walau tabel orders sudah berisi (ditolak di produksi)
import { config } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';
import { seedBase, seedDemoOrders } from './seedData.js';

if ((process.argv.includes('--reset') || process.argv.includes('--orders')) && config.isProd) {
  console.error('--reset dan --orders ditolak saat NODE_ENV=production.');
  process.exit(1);
}

const db = createDb(config.db);
try {
  await migrate(db);
  if (process.argv.includes('--reset')) {
    await db.run('TRUNCATE order_history, order_items, orders, slot_overrides, delivery_days, products RESTART IDENTITY CASCADE');
    console.log('Semua data dihapus.');
  }
  console.log((await seedBase(db)) ? 'Data dasar dibuat.' : 'Data dasar sudah ada (pakai --reset untuk mengulang).');
  if (process.argv.includes('--orders') || (await db.get('SELECT COUNT(*) AS n FROM orders')).n === 0) {
    const { created, skipped } = await seedDemoOrders(db);
    console.log(`Order contoh: ${created} dibuat${skipped ? `, ${skipped} dilewati (slot tidak cukup)` : ''}.`);
  }
} finally {
  await db.close();
}
