import fs from 'node:fs';
import pg from 'pg';

// pg mengembalikan bigint (hasil COUNT/SUM) dan kolom DATE dalam bentuk yang kurang cocok untuk aplikasi ini:
pg.types.setTypeParser(20, (v) => Number(v)); // bigint -> number (jumlah kita jauh di bawah batas aman)
pg.types.setTypeParser(1082, (v) => v); // DATE tetap string 'YYYY-MM-DD' (bukan objek Date yang tergeser zona waktu)

function sslOptions(mode, caFile) {
  if (mode === 'disable') return false;
  // 'require' = terenkripsi tetapi sertifikat server tidak diperiksa. 'verify' = terenkripsi + diperiksa (disarankan).
  if (mode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ...(caFile ? { ca: fs.readFileSync(caFile, 'utf8') } : {}) };
}

// Antarmuka kecil yang sama untuk pool biasa dan untuk transaksi, supaya service tidak perlu tahu bedanya.
const executor = (q) => ({
  all: async (sql, params = []) => (await q.query(sql, params)).rows,
  get: async (sql, params = []) => (await q.query(sql, params)).rows[0] ?? null,
  run: async (sql, params = []) => {
    const r = await q.query(sql, params);
    return { changes: r.rowCount, rows: r.rows };
  },
});

/**
 * Membuat koneksi PostgreSQL (pool).
 *   db.all/get/run(sql, [params])  -> placeholder $1, $2, ...
 *   db.transaction(async (tx) => {...}) -> tx punya all/get/run yang sama + tx.lock(key)
 */
export function createDb({ url, ssl = 'disable', sslCa = '', poolMax = 10, searchPath } = {}) {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: sslOptions(ssl, sslCa),
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'tewiwi-backend',
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}), // dipakai tes (skema terpisah per tes)
  });
  // Tanpa handler ini, koneksi idle yang diputus server (restart RDS, dsb.) bisa menjatuhkan proses.
  pool.on('error', (err) => console.error('Koneksi database idle error:', err.message));

  return {
    ...executor(pool),

    // Semua perintah di dalam fn berhasil bersama-sama, atau dibatalkan bersama-sama.
    // Di dalam fn WAJIB memakai `tx`, bukan `db` (db memakai koneksi lain, tidak melihat perubahan yang belum di-commit).
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = {
          ...executor(client),
          // Kunci per kunci-teks sampai transaksi selesai: dua transaksi dengan kunci sama berjalan bergantian.
          lock: (key) => client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]),
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* koneksi sudah putus; abaikan */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    close: () => pool.end(),
  };
}

// "($1, $2, $3), ($4, $5, $6)" untuk INSERT banyak baris sekaligus
export const valuesList = (rows, cols) =>
  Array.from({ length: rows }, (_, r) => `(${Array.from({ length: cols }, (_, c) => `$${r * cols + c + 1}`).join(', ')})`).join(', ');
