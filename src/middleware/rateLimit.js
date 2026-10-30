import { AppError } from '../utils/errors.js';

const MAX_KEYS = 10_000; // batas memori: kunci tertua dibuang jika terlalu banyak IP berbeda

/**
 * Pembatas laju sederhana (fixed window, disimpan di memori proses).
 * Cukup untuk satu proses Node. Jika nanti dijalankan di banyak instance,
 * ganti dengan penyimpanan bersama (mis. Redis / paket express-rate-limit).
 */
export function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.min(windowMs, 60_000));
  timer.unref();

  const live = (key, now) => {
    const e = hits.get(key);
    return e && e.resetAt > now ? e : null;
  };

  return {
    // Hitung satu permintaan. limited = true jika sudah melewati batas.
    hit(key) {
      const now = Date.now();
      let e = live(key, now);
      if (!e) {
        if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value);
        e = { count: 0, resetAt: now + windowMs };
        hits.set(key, e);
      }
      e.count++;
      return { count: e.count, limited: e.count > max, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
    },
    // Lihat status tanpa menambah hitungan. limited = true jika jatah sudah habis.
    peek(key) {
      const now = Date.now();
      const e = live(key, now);
      if (!e) return { count: 0, limited: false, retryAfter: 0 };
      return { count: e.count, limited: e.count >= max, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
    },
    stop: () => clearInterval(timer),
  };
}

export function rateLimit(limiter, message = 'Terlalu banyak permintaan, coba lagi nanti') {
  return (req, res, next) => {
    const r = limiter.hit(req.ip);
    if (r.limited) {
      res.set('Retry-After', String(r.retryAfter));
      throw new AppError(429, 'RATE_LIMITED', message);
    }
    next();
  };
}
