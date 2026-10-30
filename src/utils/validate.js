import { AppError } from './errors.js';
import { isISODate } from './dates.js';

const bad = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);

export function reqString(v, name, { min = 1, max = 100 } = {}) {
  if (typeof v !== 'string' || !v.trim()) throw bad(`${name} wajib diisi`);
  const s = v.trim();
  if (s.length < min) throw bad(`${name} minimal ${min} karakter`);
  if (s.length > max) throw bad(`${name} maksimal ${max} karakter`);
  return s;
}

export function reqInt(v, name, { min = 0, max = 1_000_000 } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw bad(`${name} harus bilangan bulat antara ${min} dan ${max}`);
  }
  return n;
}

export function reqDate(v, name) {
  if (typeof v !== 'string' || !isISODate(v)) throw bad(`${name} harus berformat YYYY-MM-DD`);
  return v;
}

export function reqPhone(v) {
  const s = reqString(v, 'phone', { max: 20 });
  if (!/^\+?[0-9][0-9 -]{6,18}$/.test(s)) throw bad('phone tidak valid');
  return s;
}

// Hanya true/false (atau 1/0). String seperti "false" ditolak agar tidak dianggap true.
export function reqBool(v, name) {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  throw bad(`${name} harus true atau false`);
}
