/**
 * Tewiwi Bakehouse — API Client
 * Berkomunikasi dengan backend Tewiwi API. Token admin disimpan otomatis di localStorage.
 */

const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:3000';

// ─── Token storage ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'tewiwi_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network error (server mati / CORS / koneksi)
    const e = new Error('Tidak dapat terhubung ke server. Periksa koneksi atau backend.');
    e.code = 'NETWORK_ERROR';
    throw e;
  }

  if (res.status === 204) return null;

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(json?.error?.message ?? 'Terjadi kesalahan pada server');
    err.code = json?.error?.code;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }

  return json?.data;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function healthCheck() {
  return request('/api/health');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Login admin dengan username + password. Menyimpan token dan mengembalikan { token, admin }. */
export async function login(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  setToken(data.token);
  return data;
}

/** Logout — hapus token. */
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

/** Buat admin baru (admin only). */
export async function createAdmin(data) {
  return request('/api/auth/admins', { method: 'POST', body: data });
}

/** Ganti password admin (admin only). */
export async function changePassword(id, { old_password, new_password }) {
  return request(`/api/auth/admins/${id}/password`, {
    method: 'PATCH',
    body: { old_password, new_password },
  });
}

// ─── Products ─────────────────────────────────────────────────────────────────

/** Daftar produk aktif (publik). Admin dengan token bisa pakai ?all=true. */
export async function getProducts({ all = false } = {}) {
  return request(`/api/products${all ? '?all=true' : ''}`);
}

/** Detail satu produk (publik). */
export async function getProduct(id) {
  return request(`/api/products/${id}`);
}

/** Tambah produk baru (admin only). */
export async function createProduct(data) {
  return request('/api/products', { method: 'POST', body: data });
}

/** Update produk (admin only). */
export async function updateProduct(id, data) {
  return request(`/api/products/${id}`, { method: 'PUT', body: data });
}

/** Hapus produk (admin only). */
export async function deleteProduct(id) {
  return request(`/api/products/${id}`, { method: 'DELETE' });
}

// ─── Slots ────────────────────────────────────────────────────────────────────

/** Daftar slot pengiriman mendatang (publik). */
export async function getSlots({ count = 8 } = {}) {
  return request(`/api/slots?count=${count}`);
}

/** Detail satu slot (publik). */
export async function getSlot(date) {
  return request(`/api/slots/${date}`);
}

/** Konfigurasi hari pengiriman dan override (admin only). */
export async function getSlotsConfig() {
  return request('/api/slots/config');
}

/** Update kapasitas hari pengiriman rutin (admin only). */
export async function updateDeliveryDay(weekday, data) {
  return request(`/api/slots/config/days/${weekday}`, { method: 'PUT', body: data });
}

/** Override kapasitas satu tanggal (admin only). */
export async function overrideSlotCapacity(date, capacity) {
  return request(`/api/slots/${date}/capacity`, { method: 'PUT', body: { capacity } });
}

/** Hapus override kapasitas (admin only). */
export async function deleteSlotOverride(date) {
  return request(`/api/slots/${date}/capacity`, { method: 'DELETE' });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/** Buat order baru (publik). */
export async function createOrder(data) {
  return request('/api/orders', { method: 'POST', body: data });
}

/** Lacak status order dengan kode (publik). */
export async function trackOrder(code) {
  return request(`/api/orders/track/${String(code).toUpperCase()}`);
}

/** Daftar semua order (admin only). */
export async function getOrders({ date, status } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (status) params.set('status', status);
  const qs = params.toString();
  return request(`/api/orders${qs ? `?${qs}` : ''}`);
}

/** Detail satu order (admin only). */
export async function getOrder(id) {
  return request(`/api/orders/${id}`);
}

/** Update status order (admin only). */
export async function updateOrderStatus(id, status) {
  return request(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } });
}

// ─── Production ───────────────────────────────────────────────────────────────

/** Rekap order per tanggal pengiriman (admin only). */
export async function getProductionRecap({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/api/production/recap${qs ? `?${qs}` : ''}`);
}

/** Summary produksi per produk untuk satu tanggal (admin only). */
export async function getProductionSummary(date) {
  return request(`/api/production/summary${date ? `?date=${date}` : ''}`);
}

/** Generate production brief (admin only). */
export async function generateBrief(delivery_date) {
  return request('/api/production/brief', { method: 'POST', body: { delivery_date } });
}

// ─── Model / Prediction ───────────────────────────────────────────────────────

/** Prediksi demand per produk untuk satu tanggal (admin only). */
export async function predict(delivery_date) {
  return request('/api/predict', { method: 'POST', body: { delivery_date } });
}

/** Evaluasi model prediksi (admin only). */
export async function getModelEvaluation() {
  return request('/api/model/evaluation');
}
