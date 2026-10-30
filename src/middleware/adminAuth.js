import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

const failLimiter = (req) => req.app?.locals?.adminFailLimiter;

function keyMatches(given) {
  const a = Buffer.from(given);
  const b = Buffer.from(config.adminKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// True jika request membawa admin key yang benar. Key salah dihitung sebagai percobaan gagal;
// IP yang terlalu sering salah diblokir sementara (anti tebak-tebakan key).
export function isAdmin(req) {
  const given = req.get('x-admin-key');
  if (given === undefined) return false; // tidak membawa key = bukan percobaan menebak
  const limiter = failLimiter(req);
  if (limiter?.peek(req.ip).limited) return false;
  const ok = keyMatches(given);
  if (!ok) limiter?.hit(req.ip);
  return ok;
}

export function adminOnly(req, res, next) {
  const blocked = failLimiter(req)?.peek(req.ip);
  if (blocked?.limited) {
    res.set('Retry-After', String(blocked.retryAfter));
    throw new AppError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan gagal, coba lagi nanti');
  }
  if (!isAdmin(req)) throw new AppError(401, 'UNAUTHORIZED', 'Header x-admin-key tidak valid');
  next();
}
