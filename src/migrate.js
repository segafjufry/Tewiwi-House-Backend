import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Menjalankan file migrations/*.sql yang belum pernah dijalankan, berurutan menurut nama file.
 * Aman dipanggil berulang atau dari beberapa proses sekaligus (dikunci), dan satu transaksi untuk semuanya.
 * Mengembalikan daftar nama file yang baru dijalankan.
 */
export async function migrate(db, dir = MIGRATIONS_DIR) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  await db.transaction(async (tx) => {
    await tx.lock('tewiwi:migrate');
    await tx.run(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
    );
    const done = new Set((await tx.all('SELECT name FROM schema_migrations')).map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      await tx.run(fs.readFileSync(path.join(dir, f), 'utf8')); // tanpa parameter = boleh banyak perintah
      await tx.run('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      applied.push(f);
    }
  });
  return applied;
}

// Jalankan langsung: `npm run migrate`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { config } = await import('./config.js');
  const { createDb } = await import('./db.js');
  const db = createDb(config.db);
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Migrasi dijalankan: ${applied.join(', ')}` : 'Database sudah up to date.');
  } catch (err) {
    console.error('Migrasi gagal:', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
