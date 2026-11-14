import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors.js';
import { config } from '../config.js';

const SALT_ROUNDS = 12;
const TOKEN_TTL = '8h'; // token kadaluarsa setelah 8 jam

// Hash password sebelum disimpan ke database
export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Verifikasi password plain terhadap hash tersimpan
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Buat JWT token untuk admin yang berhasil login
export function signToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, display_name: admin.display_name },
    config.adminKey,
    { expiresIn: TOKEN_TTL }
  );
}

// Verifikasi dan decode JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, config.adminKey);
  } catch {
    return null;
  }
}

// Login: cek username + password, kembalikan token jika cocok
export async function loginAdmin(db, { username, password } = {}) {
  if (!username || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'username dan password wajib diisi');
  }

  const admin = await db.get(
    'SELECT id, username, password_hash, display_name, active FROM admins WHERE username = $1',
    [String(username).toLowerCase().trim()]
  );

  // Tetap jalankan compare meski admin tidak ditemukan (mencegah timing attack)
  const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const match = await verifyPassword(String(password), admin?.password_hash ?? dummyHash);

  if (!admin || !match || !admin.active) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Username atau password salah');
  }

  await db.run('UPDATE admins SET last_login = now() WHERE id = $1', [admin.id]);

  return {
    token: signToken(admin),
    admin: { id: admin.id, username: admin.username, display_name: admin.display_name },
    expires_in: TOKEN_TTL,
  };
}

// Daftar semua admin (tanpa hash)
export async function listAdmins(db) {
  return db.all('SELECT id, username, display_name, active, created_at, last_login FROM admins ORDER BY id');
}

// Buat admin baru
export async function createAdmin(db, { username, password, display_name } = {}) {
  if (!username || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'username dan password wajib diisi');
  }
  if (String(password).length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password minimal 8 karakter');
  }

  const clean = String(username).toLowerCase().trim();
  const existing = await db.get('SELECT id FROM admins WHERE username = $1', [clean]);
  if (existing) throw new AppError(409, 'CONFLICT', `Username "${clean}" sudah dipakai`);

  const hash = await hashPassword(String(password));
  const row = await db.get(
    'INSERT INTO admins (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name, active, created_at',
    [clean, hash, String(display_name || clean)]
  );
  return row;
}

// Ubah password admin
export async function changePassword(db, id, { old_password, new_password } = {}) {
  if (!old_password || !new_password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'old_password dan new_password wajib diisi');
  }
  if (String(new_password).length < 8) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password baru minimal 8 karakter');
  }

  const admin = await db.get('SELECT id, password_hash FROM admins WHERE id = $1 AND active', [id]);
  if (!admin) throw new AppError(404, 'NOT_FOUND', 'Admin tidak ditemukan');

  const match = await verifyPassword(String(old_password), admin.password_hash);
  if (!match) throw new AppError(401, 'INVALID_CREDENTIALS', 'Password lama salah');

  const hash = await hashPassword(String(new_password));
  await db.run('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, id]);
}

// Nonaktifkan / aktifkan admin
export async function setAdminActive(db, id, active) {
  const row = await db.get('UPDATE admins SET active = $1 WHERE id = $2 RETURNING id', [Boolean(active), id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Admin tidak ditemukan');
}
