import { Router } from 'express';
import { adminOnly } from '../middleware/adminAuth.js';
import {
  loginAdmin,
  listAdmins,
  createAdmin,
  changePassword,
  setAdminActive,
} from '../services/adminService.js';
import { reqInt } from '../utils/validate.js';

export default function authRouter(db) {
  const r = Router();

  // ── Publik ──────────────────────────────────────────────────────────────────

  // POST /api/auth/login  { username, password }  → { data: { token, admin, expires_in } }
  r.post('/login', async (req, res) => {
    const result = await loginAdmin(db, req.body);
    res.json({ data: result });
  });

  // ── Admin only ───────────────────────────────────────────────────────────────

  // GET /api/auth/me  → info admin yang sedang login
  r.get('/me', adminOnly, (req, res) => {
    res.json({ data: req.admin ?? { note: 'login via API key (no profile)' } });
  });

  // GET /api/auth/admins  → daftar semua admin
  r.get('/admins', adminOnly, async (req, res) => {
    res.json({ data: await listAdmins(db) });
  });

  // POST /api/auth/admins  { username, password, display_name }  → buat admin baru
  r.post('/admins', adminOnly, async (req, res) => {
    const admin = await createAdmin(db, req.body);
    res.status(201).json({ data: admin });
  });

  // PATCH /api/auth/admins/:id/password  { old_password, new_password }
  r.patch('/admins/:id/password', adminOnly, async (req, res) => {
    const id = reqInt(req.params.id, 'id', { min: 1 });
    await changePassword(db, id, req.body);
    res.json({ data: { message: 'Password berhasil diubah' } });
  });

  // PATCH /api/auth/admins/:id/active  { active: true|false }
  r.patch('/admins/:id/active', adminOnly, async (req, res) => {
    const id = reqInt(req.params.id, 'id', { min: 1 });
    await setAdminActive(db, id, req.body?.active);
    res.json({ data: { message: `Admin ${req.body?.active ? 'diaktifkan' : 'dinonaktifkan'}` } });
  });

  return r;
}
