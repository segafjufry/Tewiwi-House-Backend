import { login as apiLogin, logout as apiLogout, isLoggedIn, getMe } from './api.js'

// Autentikasi admin lewat backend (username + password + JWT).
// Info admin di-cache di localStorage agar sesi bertahan saat halaman di-refresh.

const ADMIN_KEY = 'tewiwi_admin'

function saveAdmin(admin) {
  if (admin) localStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
  else localStorage.removeItem(ADMIN_KEY)
}

function getStoredAdmin() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Sesi awal: jika ada token dan info admin tersimpan, anggap masih login.
 * Validitas token diverifikasi saat request berikutnya (401 → logout otomatis).
 */
export function getInitialAdminSession() {
  return isLoggedIn() && getStoredAdmin() ? { admin: getStoredAdmin() } : null
}

/**
 * Verifikasi token masih valid dengan memanggil /api/auth/me.
 * Dipanggil saat app pertama kali dimuat. Mengembalikan session atau null.
 */
export async function verifySession() {
  if (!isLoggedIn()) return null
  try {
    const me = await getMe()
    if (me?.id) {
      saveAdmin(me)
      return { admin: me }
    }
  } catch {
    // token invalid / expired
  }
  apiLogout()
  saveAdmin(null)
  return null
}

/** Login admin. Mengembalikan { admin: { id, username, display_name } }. */
export async function signInAdmin(username, password) {
  const data = await apiLogin(username, password)
  saveAdmin(data.admin)
  return { admin: data.admin }
}

/** Logout admin. */
export async function signOutAdmin() {
  apiLogout()
  saveAdmin(null)
}
