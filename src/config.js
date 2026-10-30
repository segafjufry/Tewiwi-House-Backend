import 'dotenv/config';

const DEFAULT_ADMIN_KEY = 'dev-admin-key';
const MIN_ADMIN_KEY_LENGTH = 24;
const SSL_MODES = ['disable', 'require', 'verify'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('\n- '));
    this.problems = problems;
  }
}

const toInt = (v, fallback) => (Number.isInteger(Number(v)) && v !== undefined && v !== '' ? Number(v) : fallback);

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Dipisah dari `config` supaya bisa dites dengan env palsu.
export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const corsRaw = env.CORS_ORIGIN || '';
  const dbUrl = env.DATABASE_URL || (isProd ? '' : 'postgresql://tewiwi:tewiwi@localhost:5432/tewiwi');

  const cfg = {
    env: isProd ? 'production' : 'development',
    isProd,
    port: Number(env.PORT) || 3000,
    // Produksi: hanya menerima koneksi dari mesin ini (lewat Nginx). Docker/PaaS: isi HOST=0.0.0.0
    host: env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0'),
    // Jumlah proxy (Nginx, dll.) di depan aplikasi. Wajib benar agar IP pengguna terbaca untuk rate limit.
    trustProxy: toInt(env.TRUST_PROXY, 0),
    db: {
      url: dbUrl,
      // disable = tanpa TLS (hanya untuk database lokal) | require = TLS tanpa cek sertifikat | verify = TLS + cek sertifikat
      ssl: env.DATABASE_SSL || (isProd ? 'verify' : 'disable'),
      sslCa: env.DATABASE_SSL_CA || '', // file CA (untuk RDS: global-bundle.pem)
      poolMax: toInt(env.DB_POOL_MAX, 10),
    },
    autoMigrate: env.AUTO_MIGRATE !== 'false',
    adminKey: env.ADMIN_API_KEY || DEFAULT_ADMIN_KEY,
    corsOrigins: (corsRaw || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    minLeadDays: Number(env.MIN_LEAD_DAYS) || 2,
    productionLeadDays: 2, // roti diproduksi H-2 sebelum pengiriman
    seedBaseData: env.SEED_BASE_DATA !== 'false',
    // Info pembayaran yang ditampilkan ke pelanggan setelah order dibuat (layar "Pesanan diterima").
    payment: {
      bankName: env.PAYMENT_BANK_NAME || 'BCA',
      accountNumber: env.PAYMENT_ACCOUNT_NUMBER || '',
      accountName: env.PAYMENT_ACCOUNT_NAME || 'Tewiwi House',
      adminWhatsapp: env.ADMIN_WHATSAPP || '', // contoh: 081234567890 atau 6281234567890
    },
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    rateLimit: {
      global: { windowMs: 60_000, max: 120 }, // semua /api, per IP
      createOrder: { windowMs: 15 * 60_000, max: toInt(env.RATE_LIMIT_ORDERS, 10) }, // POST /api/orders
      track: { windowMs: 15 * 60_000, max: 30 }, // GET /api/orders/track/:code
      adminFail: { windowMs: 15 * 60_000, max: 10 }, // salah memasukkan admin key
    },
    warnings: [],
  };

  const problems = [];

  // Database (semua mode)
  if (!SSL_MODES.includes(cfg.db.ssl)) problems.push(`DATABASE_SSL harus salah satu dari: ${SSL_MODES.join(', ')}.`);
  if (isProd && !env.DATABASE_URL) {
    problems.push('DATABASE_URL belum diisi (contoh: postgresql://user:password@host:5432/tewiwi).');
  } else if (hostOf(dbUrl) === null) {
    problems.push('DATABASE_URL tidak valid (karakter khusus di password harus di-encode, mis. @ menjadi %40).');
  } else if (/sslmode=/i.test(dbUrl)) {
    problems.push('Hapus "sslmode" dari DATABASE_URL dan atur lewat DATABASE_SSL (disable / require / verify).');
  }

  if (isProd) {
    if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY === DEFAULT_ADMIN_KEY) {
      problems.push('ADMIN_API_KEY belum diisi (atau masih nilai default).');
    } else if (env.ADMIN_API_KEY.length < MIN_ADMIN_KEY_LENGTH) {
      problems.push(`ADMIN_API_KEY terlalu pendek (minimal ${MIN_ADMIN_KEY_LENGTH} karakter).`);
    }
    if (!corsRaw) {
      problems.push('CORS_ORIGIN belum diisi (isi dengan alamat frontend, mis. https://app.contoh.com).');
    } else if (cfg.corsOrigins.includes('*')) {
      problems.push('CORS_ORIGIN tidak boleh "*" di produksi.');
    }
    const host = hostOf(dbUrl);
    if (host && cfg.db.ssl === 'disable' && !LOCAL_HOSTS.includes(host)) {
      cfg.warnings.push('DATABASE_SSL=disable ke database selain localhost: data dikirim tanpa enkripsi.');
    }
    if (cfg.db.ssl === 'require') {
      cfg.warnings.push('DATABASE_SSL=require tidak memeriksa sertifikat server. Pakai "verify" + DATABASE_SSL_CA untuk keamanan penuh.');
    }
  }

  if (problems.length) throw new ConfigError(problems);
  return cfg;
}

let config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`Konfigurasi tidak aman/tidak lengkap, server tidak dijalankan:\n- ${err.message}`);
  process.exit(1);
}
export { config };
