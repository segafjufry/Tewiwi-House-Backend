// Reset password admin langsung dari terminal (tanpa perlu login).
// Pakai: node src/reset-password.js <username> <password_baru>
// Contoh: node src/reset-password.js admin passwordbaru123

import { createDb } from './db.js';
import { config } from './config.js';
import { hashPassword } from './services/adminService.js';

const [username, newPassword] = process.argv.slice(2);

if (!username || !newPassword) {
  console.error('Penggunaan: node src/reset-password.js <username> <password_baru>');
  console.error('Contoh:    node src/reset-password.js admin passwordbaru123');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('Password baru minimal 8 karakter.');
  process.exit(1);
}

const db = createDb(config.db);
try {
  const admin = await db.get('SELECT id, username, display_name FROM admins WHERE username = $1', [
    username.toLowerCase().trim(),
  ]);

  if (!admin) {
    console.error(`Admin dengan username "${username}" tidak ditemukan.`);
    process.exit(1);
  }

  const hash = await hashPassword(newPassword);
  await db.run('UPDATE admins SET password_hash = $1, active = TRUE WHERE id = $2', [hash, admin.id]);

  console.log(`✅ Password admin "${admin.username}" (${admin.display_name}) berhasil direset.`);
  console.log(`   Username : ${admin.username}`);
  console.log(`   Password : ${newPassword}`);
  console.log(`   Segera ganti password setelah login!`);
} finally {
  await db.close();
}
