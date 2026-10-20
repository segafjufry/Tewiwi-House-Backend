# Tewiwi House – Backend (Express.js + SQLite)

REST API untuk Use Case 2: Smart Order & Production Scheduling.

## Menjalankan

```bash
npm install
cp .env.example .env        # lalu ubah ADMIN_API_KEY
npm run seed                # opsional: order contoh (slot terdekat dibuat penuh)
npm run dev                 # http://localhost:3000
npm test
```

Butuh Node.js 22.13+ (memakai SQLite bawaan Node, tanpa paket native). Saat pertama kali jalan, database kosong otomatis diisi produk, hari pengiriman
(Selasa & Jumat, kapasitas 50) dan 16 minggu histori sintetis. `npm run seed:reset` mengulang dari awal.

## Struktur

```
src/
  app.js, server.js, config.js, db.js (skema SQLite)
  routes/       products, slots, orders, production, model
  services/     slotService (kapasitas), orderService, predictionService (model), briefService (GenAI)
  middleware/   adminAuth (header x-admin-key), errorHandler
  seed.js, seedData.js
test/services.test.js
```

## Mekanisme capacity management

- Kapasitas slot = override tanggal (`slot_overrides`) jika ada, kalau tidak kapasitas default hari itu (`delivery_days`).
- Terisi = jumlah `quantity` semua order pada tanggal itu yang statusnya bukan `Dibatalkan`.
- `status` slot = `full` jika sisa = 0. Slot `full` menolak order baru.
- `POST /api/orders` mengecek kapasitas dan menyimpan order dalam satu transaksi database, jadi dua order
  bersamaan tidak bisa melewati kapasitas.
- Jika ditolak (HTTP 409), response memuat `details.next_available` (slot berikutnya yang cukup), contohnya Jumat.
- Order hanya bisa untuk tanggal >= hari ini + `MIN_LEAD_DAYS` (default 2, karena produksi H-2).
- Membatalkan order (`Dibatalkan`) otomatis mengembalikan kapasitas.

## Autentikasi

Endpoint publik: lihat produk, lihat slot, buat order, cek order lewat kode.
Endpoint admin memerlukan header `x-admin-key: <ADMIN_API_KEY>`.

## Endpoint

Semua response sukses berbentuk `{ "data": ... }`, error berbentuk `{ "error": { code, message, details } }`.

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | /api/health | publik | cek server |
| GET | /api/products | publik | produk aktif (`?all=true` + admin key = semua) |
| GET | /api/products/:id | publik | detail produk |
| POST / PUT / DELETE | /api/products, /api/products/:id | admin | CRUD produk (hapus produk yang sudah dipakai = 409, nonaktifkan saja) |
| GET | /api/slots?count=8 | publik | slot mendatang: capacity, used, left, status, next_available |
| GET | /api/slots/:date | publik | satu slot (YYYY-MM-DD) |
| GET | /api/slots/config | admin | hari pengiriman dan override |
| PUT | /api/slots/config/days/:weekday | admin | `{capacity, active}` (0=Minggu ... 6=Sabtu) |
| PUT / DELETE | /api/slots/:date/capacity | admin | override kapasitas satu tanggal |
| POST | /api/orders | publik | buat order |
| GET | /api/orders/track/:code | publik | cek status via kode order |
| GET | /api/orders?date=&status= | admin | daftar order |
| GET | /api/orders/:id | admin | detail order |
| PATCH | /api/orders/:id/status | admin | `{status}`: Baru, Dikonfirmasi, Diproduksi, Dikirim, Dibatalkan |
| GET | /api/production/recap?from=&to= | admin | rekap order per tanggal pengiriman |
| GET | /api/production/summary?date= | admin | order vs prediksi vs target produksi, estimasi tepung |
| POST | /api/production/brief | admin | `{delivery_date}` → production brief |
| POST | /api/predict | admin | `{delivery_date}` → prediksi demand per produk (inference API) |
| GET | /api/model/evaluation | admin | MAE, MAPE, baseline pada data uji |

### Contoh

```bash
# lihat slot
curl localhost:3000/api/slots

# buat order
curl -X POST localhost:3000/api/orders -H 'content-type: application/json' -d '{
  "customer_name": "Andi", "phone": "081234567890", "delivery_date": "2026-10-16",
  "items": [{ "product_id": 1, "quantity": 3 }, { "product_id": 3, "quantity": 2 }]
}'

# prediksi + brief (admin)
curl -X POST localhost:3000/api/predict -H 'x-admin-key: KUNCI' -H 'content-type: application/json' -d '{"delivery_date":"2026-10-16"}'
curl -X POST localhost:3000/api/production/brief -H 'x-admin-key: KUNCI' -H 'content-type: application/json' -d '{"delivery_date":"2026-10-16"}'
```

Dari React: `fetch('http://localhost:3000/api/slots')`. Jika `status === 'full'`, nonaktifkan tombol slot dan tawarkan
`next_available`. Atur `CORS_ORIGIN` sesuai alamat dev server React.

## Skema database

`products`, `delivery_days`, `slot_overrides`, `orders`, `order_items`, `order_history`.
Definisi lengkap dan komentarnya ada di `src/db.js`.

## Model AI dan Generative AI

- **Preprocessing:** `order_history` + order nyata yang tanggalnya sudah lewat dijumlahkan per tanggal, per produk,
  lalu dipisah per hari pengiriman (semua Selasa, semua Jumat).
- **Model:** weighted moving average 6 slot terakhir + setengah kemiringan tren linear (`predictionService.js`).
- **Evaluasi:** walk-forward, 20% data terakhir sebagai data uji; dibandingkan baseline "ulangi slot sebelumnya".
  Hasil: `GET /api/model/evaluation`.
- **Brief:** jika `ANTHROPIC_API_KEY` diisi, teks brief ditulis oleh Claude dari data terstruktur (angka tidak
  dikarang). Jika kosong atau gagal, memakai template. Field `source` menunjukkan `llm` atau `template`.
- Histori default adalah **data sintetis**. Ganti dengan data asli lewat tabel `order_history`.

## Catatan

- Autentikasi admin memakai satu API key bersama: cukup untuk prototype, belum untuk produksi.
- SQLite cocok untuk skala kecil. Untuk banyak server, pindah ke PostgreSQL/MySQL.
