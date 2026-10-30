import { config } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';
import { seedBase } from './seedData.js';
import { createApp } from './app.js';

const db = createDb(config.db);

try {
  if (config.autoMigrate) {
    const applied = await migrate(db);
    if (applied.length) console.log(`Migrasi dijalankan: ${applied.join(', ')}`);
  }
  if (config.seedBaseData) await seedBase(db); // hanya mengisi jika database masih kosong
} catch (err) {
  console.error('Gagal menyiapkan database:', err.message);
  await db.close().catch(() => {});
  process.exit(1);
}

const server = createApp(db).listen(config.port, config.host, (err) => {
  if (err) {
    console.error('Gagal menjalankan server:', err.message);
    process.exit(1);
  }
  console.log(`API (${config.env}) berjalan di http://${config.host}:${config.port}`);
  if (config.adminKey === 'dev-admin-key') console.warn('Peringatan: ADMIN_API_KEY belum diatur, memakai kunci default.');
  if (config.isProd && !config.trustProxy) {
    console.warn('Peringatan: TRUST_PROXY=0. Jika di belakang Nginx/proxy, isi TRUST_PROXY=1 agar rate limit memakai IP pengguna asli.');
  }
  for (const w of config.warnings) console.warn(`Peringatan: ${w}`);
});

// Batas waktu koneksi: mengurangi risiko koneksi menggantung (slowloris)
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 65_000; // lebih lama dari keep-alive Nginx (60 dtk)

// Berhenti dengan rapi saat proses manager (systemd/Docker/pm2) mematikan server
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal} diterima, menutup server...`);
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
