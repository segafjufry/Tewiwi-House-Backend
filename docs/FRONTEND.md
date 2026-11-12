# Panduan Integrasi Frontend

Dokumen ini menjelaskan semua yang dibutuhkan developer frontend untuk mengintegrasikan dengan Tewiwi Bakehouse API.

## Setup

### 1. Jalankan Backend

```bash
npm install
npm run dev   # berjalan di http://localhost:3000
```

### 2. Konfigurasi URL di Frontend

Buat file `.env` di proyek frontend (Vite/React):

```env
VITE_API_URL=http://localhost:3000
```

### 3. Pakai API Client

Copy file `docs/api-client.js` ke proyek frontend kamu (misalnya `src/lib/api.js`).
Semua fungsi sudah siap pakai dengan token management otomatis.

```js
import { getProducts, createOrder, login } from './lib/api.js'
```

---

## Format Response

Semua endpoint menggunakan format yang konsisten:

**Sukses:**
```json
{ "data": <payload> }
```

**Error:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Pesan error yang bisa ditampilkan ke user",
    "details": { ... }
  }
}
```

---

## Autentikasi

Admin login lewat `POST /api/auth/login`, lalu token JWT disimpan dan dikirim di header:
```
Authorization: Bearer <token>
```

Token berlaku **8 jam**. Jika expired, API mengembalikan `401 UNAUTHORIZED`.

```js
// Login
const { token, admin } = await login('admin', 'password')

// Cek apakah sudah login
const me = await getMe()

// Logout
logout()
```

---

## Alur Customer (Publik)

### 1. Tampilkan Produk

```js
const products = await getProducts()
// [{ id, name, price, flour_grams, active }, ...]
```

### 2. Tampilkan Slot Pengiriman

```js
const slots = await getSlots({ count: 8 })
```

Response tiap slot:
```json
{
  "delivery_date": "2026-11-07",
  "weekday": 5,
  "day_name": "Jumat",
  "capacity": 50,
  "used": 18,
  "left": 32,
  "status": "available",
  "next_available": null
}
```

- `status: "full"` → slot penuh, nonaktifkan tombol
- `next_available` → tanggal slot alternatif (muncul jika `status: "full"`)

### 3. Buat Order

```js
try {
  const order = await createOrder({
    customer_name: 'Andi',
    phone: '081234567890',
    delivery_address: 'Jl. Melati No. 12, Bekasi',
    delivery_date: '2026-11-07',
    items: [
      { product_id: 4, quantity: 5 },
      { product_id: 8, quantity: 3 }
    ]
  })

  // Tampilkan kode order dan instruksi pembayaran
  console.log(order.code)         // "TW-A1B2C3"
  console.log(order.payment)      // { amount, bank_name, account_number, whatsapp_url, ... }

} catch (err) {
  if (err.code === 'SLOT_FULL' || err.code === 'INSUFFICIENT_CAPACITY') {
    // Tawarkan slot alternatif
    const nextSlot = err.details?.next_available
  }
}
```

**Response `payment`:**
```json
{
  "amount": 234000,
  "bank_name": "BCA",
  "account_number": "1234567890",
  "account_name": "Tewiwi House",
  "transfer_note": "TW-A1B2C3",
  "whatsapp_number": "6281210398771",
  "whatsapp_url": "https://wa.me/6281210398771?text=..."
}
```

### 4. Lacak Order

```js
const order = await trackOrder('TW-A1B2C3')
// { code, delivery_date, status, items, total_price }
```

---

## Alur Admin

### Login

```js
const { token, admin } = await login('admin', 'tewiwi2025')
// token otomatis disimpan ke localStorage
```

### Kelola Order

```js
// Semua order
const orders = await getOrders()

// Filter by status
const newOrders = await getOrders({ status: 'Baru' })

// Filter by tanggal
const todayOrders = await getOrders({ date: '2026-11-07' })

// Update status
await updateOrderStatus(1, 'Dikonfirmasi')
// Status: Baru → Dikonfirmasi → Diproduksi → Dikirim → Dibatalkan
```

### Produksi

```js
// Rekap per tanggal
const recap = await getProductionRecap({ from: '2026-11-01', to: '2026-11-30' })

// Summary per produk
const summary = await getProductionSummary('2026-11-07')

// Generate brief
const brief = await generateBrief('2026-11-07')
// { delivery_date, source: 'llm'|'template', brief: string, data: {...} }
```

### Kelola Produk

```js
// Semua produk termasuk yang nonaktif (butuh token admin)
const products = await getProducts({ all: true })

// Tambah produk
const product = await createProduct({
  name: 'Produk Baru',
  price: 25000,
  flour_grams: 150
})

// Update produk
await updateProduct(1, { price: 28000, active: true })

// Nonaktifkan produk (jangan dihapus jika sudah ada di order)
await updateProduct(1, { active: false })
```

---

## Error Codes

| Code | HTTP | Keterangan |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input tidak valid |
| `INVALID_JSON` | 400 | Body bukan JSON valid |
| `UNAUTHORIZED` | 401 | Belum login atau token expired |
| `INVALID_CREDENTIALS` | 401 | Username/password salah |
| `NOT_FOUND` | 404 | Data tidak ditemukan |
| `SLOT_FULL` | 409 | Slot pengiriman penuh → cek `details.next_available` |
| `INSUFFICIENT_CAPACITY` | 409 | Kuantitas melebihi sisa slot → cek `details.next_available` |
| `PRODUCT_IN_USE` | 409 | Produk sudah dipakai di order, tidak bisa dihapus |
| `CONFLICT` | 409 | Data duplikat (mis. username sudah ada) |
| `INVALID_SLOT` | 422 | Tanggal bukan hari pengiriman |
| `TOO_SOON` | 422 | Tanggal terlalu dekat (minimal H+2) |
| `INVALID_PRODUCT` | 422 | Produk tidak aktif atau tidak ditemukan |
| `RATE_LIMITED` | 429 | Terlalu banyak request, coba lagi nanti |
| `INTERNAL_ERROR` | 500 | Kesalahan server |

### Contoh penanganan error di React

```js
try {
  const order = await createOrder(data)
  // sukses
} catch (err) {
  switch (err.code) {
    case 'SLOT_FULL':
    case 'INSUFFICIENT_CAPACITY':
      setMessage(`Slot penuh. Tersedia: ${err.details?.next_available?.delivery_date}`)
      break
    case 'TOO_SOON':
      setMessage('Pemesanan minimal 2 hari sebelum pengiriman')
      break
    case 'VALIDATION_ERROR':
      setMessage(err.message)
      break
    case 'RATE_LIMITED':
      setMessage('Terlalu banyak percobaan, coba lagi dalam 15 menit')
      break
    default:
      setMessage('Terjadi kesalahan, coba lagi')
  }
}
```

---

## Contoh Komponen React

### Form Order Sederhana

```jsx
import { useState, useEffect } from 'react'
import { getProducts, getSlots, createOrder } from '../lib/api'

export function OrderForm() {
  const [products, setProducts] = useState([])
  const [slots, setSlots] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    customer_name: '', phone: '', delivery_address: '', delivery_date: ''
  })
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getProducts().then(setProducts)
    getSlots({ count: 6 }).then(setSlots)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const order = await createOrder({ ...form, items })
      setResult(order)
    } catch (err) {
      if (err.code === 'SLOT_FULL' || err.code === 'INSUFFICIENT_CAPACITY') {
        const next = err.details?.next_available?.delivery_date
        setError(`Slot penuh. Slot terdekat tersedia: ${next ?? 'tidak ada'}`)
      } else {
        setError(err.message)
      }
    }
  }

  if (result) {
    return (
      <div>
        <h2>Pesanan Berhasil! 🎉</h2>
        <p>Kode order: <strong>{result.code}</strong></p>
        <p>Total: Rp{result.total_price.toLocaleString('id-ID')}</p>
        <p>Transfer ke {result.payment.bank_name} {result.payment.account_number}</p>
        <p>Berita transfer: <strong>{result.payment.transfer_note}</strong></p>
        {result.payment.whatsapp_url && (
          <a href={result.payment.whatsapp_url} target="_blank" rel="noreferrer">
            Kirim bukti transfer via WhatsApp
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="Nama" value={form.customer_name}
        onChange={e => setForm({ ...form, customer_name: e.target.value })} />
      <input placeholder="Nomor HP" value={form.phone}
        onChange={e => setForm({ ...form, phone: e.target.value })} />
      <input placeholder="Alamat pengiriman" value={form.delivery_address}
        onChange={e => setForm({ ...form, delivery_address: e.target.value })} />

      <select value={form.delivery_date}
        onChange={e => setForm({ ...form, delivery_date: e.target.value })}>
        <option value="">Pilih tanggal pengiriman</option>
        {slots.map(slot => (
          <option key={slot.delivery_date} value={slot.delivery_date}
            disabled={slot.status === 'full'}>
            {slot.day_name}, {slot.delivery_date}
            {slot.status === 'full' ? ' (Penuh)' : ` (sisa ${slot.left})`}
          </option>
        ))}
      </select>

      {/* Item selector — sesuaikan dengan UI kamu */}
      {products.map(p => (
        <div key={p.id}>
          <span>{p.name} — Rp{p.price.toLocaleString('id-ID')}</span>
          <input type="number" min={0} placeholder="0"
            onChange={e => {
              const qty = parseInt(e.target.value) || 0
              setItems(prev => {
                const filtered = prev.filter(i => i.product_id !== p.id)
                return qty > 0 ? [...filtered, { product_id: p.id, quantity: qty }] : filtered
              })
            }} />
        </div>
      ))}

      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Pesan Sekarang</button>
    </form>
  )
}
```

### Lacak Order

```jsx
import { useState } from 'react'
import { trackOrder } from '../lib/api'

export function TrackOrder() {
  const [code, setCode] = useState('')
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)

  const handleTrack = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      setOrder(await trackOrder(code))
    } catch (err) {
      setError(err.code === 'NOT_FOUND' ? 'Kode order tidak ditemukan' : err.message)
    }
  }

  return (
    <div>
      <form onSubmit={handleTrack}>
        <input placeholder="Contoh: TW-A1B2C3" value={code}
          onChange={e => setCode(e.target.value.toUpperCase())} />
        <button type="submit">Lacak</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {order && (
        <div>
          <p>Status: <strong>{order.status}</strong></p>
          <p>Tanggal pengiriman: {order.delivery_date}</p>
          <p>Total: Rp{order.total_price.toLocaleString('id-ID')}</p>
        </div>
      )}
    </div>
  )
}
```

---

## Variabel Environment Frontend

Buat file `.env` di root proyek frontend:

```env
# URL backend (ganti saat deploy)
VITE_API_URL=http://localhost:3000
```

Saat deploy ke produksi:
```env
VITE_API_URL=https://api.tewiwi.com
```

---

## CORS

Backend sudah dikonfigurasi untuk menerima request dari:
- `http://localhost:5173` (Vite default)
- `http://localhost:3001`
- `http://localhost:4173` (Vite preview)

Jika frontend berjalan di port lain, tambahkan ke `CORS_ORIGIN` di `.env` backend:
```env
CORS_ORIGIN=http://localhost:5173,http://localhost:YOUR_PORT
```
