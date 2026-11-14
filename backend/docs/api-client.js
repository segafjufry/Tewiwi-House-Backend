/**
 * Tewiwi Bakehouse — API Client Helper
 *
 * Copy file ini ke proyek frontend kamu (src/lib/api.js atau src/services/api.js).
 * Ganti BASE_URL dengan URL backend yang sesuai.
 *
 * Penggunaan:
 *   import { getProducts, createOrder, login } from './api.js'
 */

const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:3000';

// ─── Token storage ────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('tewiwi_token');
}

function setToken(token) {
  localStorage.setItem('tewiwi_token', token);
}

function clearToken() {
  localStorage.removeItem('tewiwi_token');
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // 204 No Content
  if (res.status === 204) return null;

  const json = await res.json();

  if (!res.ok) {
    const err = new Error(json?.error?.message ?? 'Terjadi kesalahan pada server');
    err.code = json?.error?.code;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }

  return json.data;
}

// ─── Health ───────────────────────────────────────────────────────────────────

/** Cek status server dan koneksi database. */
export async function healthCheck() {
  return request('/api/health');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Login admin.
 * @param {string} username
 * @param {string} password
 * @returns {{ token: string, admin: { id, username, display_name }, expires_in: string }}
 */
export async function login(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  setToken(data.token);
  return data;
}

/** Logout — hapus token dari localStorage. */
export function logout() {
  clearToken();
}

/** Info admin yang sedang login (dari JWT). */
export async function getMe() {
  return request('/api/auth/me');
}

/** Daftar semua admin (admin only). */
export async function getAdmins() {
  return request('/api/auth/admins');
}

/**
 * Buat admin baru (admin only).
 * @param {{ username: string, password: string, display_name?: string }} data
 */
export async function createAdmin(data) {
  return request('/api/auth/admins', { method: 'POST', body: data });
}

/**
 * Ganti password admin (admin only).
 * @param {number} id
 * @param {{ old_password: string, new_password: string }} data
 */
export async function changePassword(id, data) {
  return request(`/api/auth/admins/${id}/password`, { method: 'PATCH', body: data });
}

/**
 * Aktifkan / nonaktifkan admin (admin only).
 * @param {number} id
 * @param {boolean} active
 */
export async function setAdminActive(id, active) {
  return request(`/api/auth/admins/${id}/active`, { method: 'PATCH', body: { active } });
}

// ─── Products ─────────────────────────────────────────────────────────────────

/**
 * Daftar produk aktif (publik). Admin dengan token bisa pakai ?all=true untuk melihat semua.
 * @param {{ all?: boolean }} opts
 * @returns {Array<{ id, name, price, flour_grams, active }>}
 */
export async function getProducts({ all = false } = {}) {
  return request(`/api/products${all ? '?all=true' : ''}`);
}

/**
 * Detail satu produk (publik).
 * @param {number} id
 */
export async function getProduct(id) {
  return request(`/api/products/${id}`);
}

/**
 * Tambah produk baru (admin only).
 * @param {{ name: string, price: number, flour_grams?: number, active?: boolean }} data
 */
export async function createProduct(data) {
  return request('/api/products', { method: 'POST', body: data });
}

/**
 * Update produk (admin only).
 * @param {number} id
 * @param {{ name?: string, price?: number, flour_grams?: number, active?: boolean }} data
 */
export async function updateProduct(id, data) {
  return request(`/api/products/${id}`, { method: 'PUT', body: data });
}

/**
 * Hapus produk (admin only). Jika sudah dipakai di order → 409, nonaktifkan saja.
 * @param {number} id
 */
export async function deleteProduct(id) {
  return request(`/api/products/${id}`, { method: 'DELETE' });
}

// ─── Slots ────────────────────────────────────────────────────────────────────

/**
 * Daftar slot pengiriman mendatang (publik).
 * @param {{ count?: number }} opts - jumlah slot yang diambil (default 8)
 * @returns {Array<{ delivery_date, weekday, day_name, capacity, used, left, status, next_available? }>}
 */
export async function getSlots({ count = 8 } = {}) {
  return request(`/api/slots?count=${count}`);
}

/**
 * Detail satu slot (publik).
 * @param {string} date - format YYYY-MM-DD
 */
export async function getSlot(date) {
  return request(`/api/slots/${date}`);
}

/**
 * Konfigurasi hari pengiriman dan override (admin only).
 */
export async function getSlotsConfig() {
  return request('/api/slots/config');
}

/**
 * Update kapasitas hari pengiriman rutin (admin only).
 * @param {number} weekday - 0=Minggu ... 6=Sabtu
 * @param {{ capacity: number, active?: boolean }} data
 */
export async function updateDeliveryDay(weekday, data) {
  return request(`/api/slots/config/days/${weekday}`, { method: 'PUT', body: data });
}

/**
 * Override kapasitas satu tanggal (admin only).
 * @param {string} date - format YYYY-MM-DD
 * @param {number} capacity
 */
export async function overrideSlotCapacity(date, capacity) {
  return request(`/api/slots/${date}/capacity`, { method: 'PUT', body: { capacity } });
}

/**
 * Hapus override kapasitas (admin only).
 * @param {string} date - format YYYY-MM-DD
 */
export async function deleteSlotOverride(date) {
  return request(`/api/slots/${date}/capacity`, { method: 'DELETE' });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * Buat order baru (publik).
 * @param {{
 *   customer_name: string,
 *   phone: string,
 *   delivery_address: string,
 *   delivery_date: string,
 *   items: Array<{ product_id: number, quantity: number }>
 * }} data
 * @returns {{ id, code, customer_name, phone, delivery_address, delivery_date, status, items, total_quantity, total_price, payment }}
 *
 * Response juga berisi objek `payment`:
 * { amount, bank_name, account_number, account_name, transfer_note, whatsapp_number, whatsapp_url }
 *
 * Error 409 SLOT_FULL / INSUFFICIENT_CAPACITY → details.next_available berisi slot alternatif.
 */
export async function createOrder(data) {
  return request('/api/orders', { method: 'POST', body: data });
}

/**
 * Lacak status order dengan kode (publik).
 * @param {string} code - contoh "TW-A1B2C3"
 * @returns {{ code, delivery_date, status, items, total_price }}
 */
export async function trackOrder(code) {
  return request(`/api/orders/track/${code.toUpperCase()}`);
}

/**
 * Daftar semua order (admin only).
 * @param {{ date?: string, status?: string }} filters
 */
export async function getOrders({ date, status } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (status) params.set('status', status);
  const qs = params.toString();
  return request(`/api/orders${qs ? `?${qs}` : ''}`);
}

/**
 * Detail satu order (admin only).
 * @param {number} id
 */
export async function getOrder(id) {
  return request(`/api/orders/${id}`);
}

/**
 * Update status order (admin only).
 * @param {number} id
 * @param {string} status - Baru | Dikonfirmasi | Diproduksi | Dikirim | Dibatalkan
 */
export async function updateOrderStatus(id, status) {
  return request(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } });
}

// ─── Production ───────────────────────────────────────────────────────────────

/**
 * Rekap order per tanggal pengiriman (admin only).
 * @param {{ from?: string, to?: string }} opts - format YYYY-MM-DD
 */
export async function getProductionRecap({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/api/production/recap${qs ? `?${qs}` : ''}`);
}

/**
 * Summary produksi per produk untuk satu tanggal (admin only).
 * @param {string} date - format YYYY-MM-DD
 */
export async function getProductionSummary(date) {
  return request(`/api/production/summary${date ? `?date=${date}` : ''}`);
}

/**
 * Generate production brief (admin only).
 * @param {string} delivery_date - format YYYY-MM-DD
 * @returns {{ delivery_date, source: 'llm'|'template', brief: string, data: object }}
 */
export async function generateBrief(delivery_date) {
  return request('/api/production/brief', { method: 'POST', body: { delivery_date } });
}

// ─── Model / Prediction ───────────────────────────────────────────────────────

/**
 * Prediksi demand per produk untuk satu tanggal (admin only).
 * @param {string} delivery_date - format YYYY-MM-DD
 */
export async function predict(delivery_date) {
  return request('/api/predict', { method: 'POST', body: { delivery_date } });
}

/**
 * Evaluasi model prediksi (admin only).
 */
export async function getModelEvaluation() {
  return request('/api/model/evaluation');
}
