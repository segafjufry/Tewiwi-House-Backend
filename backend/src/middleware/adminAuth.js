import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { verifyToken } from '../services/adminService.js';

const failLimiter = (req) => req.app?.locals?.adminFailLimiter;

function keyMatches(given) {
  const a = Buffer.from(given);
  const b = Buffer.from(config.adminKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Cek apakah request membawa kredensial admin yang valid.
 * Mendukung dua cara:
 *   1. Header `x-admin-key` berisi API key (backward-compatible)
 *   2. Header `Authorization: Bearer <jwt>` dari hasil login
 */
export function isAdmin(req) {
  const limiter = failLimiter(req);
  if (limiter?.peek(req.ip)?.limited) return false;

  // Cara 1: JWT Bearer token
  const authHeader = (req.get('Authorization') || req.get('authorization') || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (payload) {
      req.admin = payload; // tersedia di handler: req.admin.username, req.admin.sub
      return true;
    }
    // Token ada tapi tidak valid = hitung sebagai percobaan gagal
    limiter?.hit(req.ip);
    return false;
  }

  // Cara 2: x-admin-key (API key lama, tetap didukung)
  const given = req.get('x-admin-key');
  if (given === undefined) return false;
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
  if (!isAdmin(req)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Login diperlukan. Gunakan POST /api/auth/login atau sertakan x-admin-key');
  }
  next();
}
