// Database PostgreSQL sungguhan untuk tes. Setiap tes memakai SKEMA SENDIRI (dibuat lalu dihapus),
// jadi tes tidak saling mengganggu dan tidak menyentuh data di skema "public".
// Jalankan dengan:  TEST_DATABASE_URL=postgresql://tewiwi:tewiwi@localhost:5432/tewiwi_test npm test
import crypto from 'node:crypto';
import test from 'node:test';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seedBase } from '../src/seedData.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const skip = TEST_DB_URL ? false : 'set TEST_DATABASE_URL untuk menjalankan tes yang memakai PostgreSQL';

export async function createTestDb({ seed = true } = {}) {
  const schema = `t_${crypto.randomBytes(6).toString('hex')}`;
  const admin = createDb({ url: TEST_DB_URL, poolMax: 1 });
  await admin.run(`CREATE SCHEMA ${schema}`);
  const db = createDb({ url: TEST_DB_URL, poolMax: 5, searchPath: schema });
  await migrate(db);
  if (seed) await seedBase(db);
  return {
    db,
    cleanup: async () => {
      await db.close();
      await admin.run(`DROP SCHEMA ${schema} CASCADE`);
      await admin.close();
    },
  };
}

// Pembungkus `test`: menyiapkan database baru untuk tiap tes dan membersihkannya setelah selesai.
export function dbTest(name, fn, opts = {}) {
  test(name, { skip }, async () => {
    const ctx = await createTestDb(opts);
    try {
      await fn(ctx.db);
    } finally {
      await ctx.cleanup();
    }
  });
}
