// Pakai: npm run seed           -> isi data contoh jika database masih kosong
//        npm run seed:reset     -> HAPUS SEMUA DATA lalu isi ulang (ditolak di produksi)
//        npm run seed:orders    -> TAMBAH order contoh walau tabel orders sudah berisi (ditolak di produksi)
import { config } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';
import { seedBase, seedDemoOrders } from './seedData.js';
import { createAdmin, listAdmins } from './services/adminService.js';

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

  // Buat akun admin default jika belum ada admin sama sekali
  const admins = await listAdmins(db);
  if (admins.length === 0) {
    await createAdmin(db, { username: 'admin', password: 'tewiwi2025', display_name: 'Admin Tewiwi' });
    console.log('Akun admin default dibuat: username=admin password=tewiwi2025');
    console.log('Segera ganti password lewat PATCH /api/auth/admins/1/password setelah login!');
  } else {
    console.log(`Admin sudah ada (${admins.length} akun), tidak membuat ulang.`);
  }
} finally {
  await db.close();
}
