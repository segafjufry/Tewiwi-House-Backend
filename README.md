# Tewiwi House – Backend (Express.js + PostgreSQL)

REST API untuk Use Case 2: Smart Order & Production Scheduling.

## Menjalankan

```bash
npm install
docker compose up -d db     # PostgreSQL lokal (atau pakai PostgreSQL/RDS Anda sendiri dan atur DATABASE_URL)
cp .env.example .env        # nilai bawaan sudah cocok dengan docker-compose
npm run dev                 # membuat tabel otomatis (migrasi), lalu jalan di http://localhost:3000
npm run seed                # opsional: order contoh (slot terdekat dibuat penuh)
npm run seed:orders         # tambah 7 order contoh lagi (lengkap dengan alamat) walau tabel orders sudah berisi
```

Butuh Node.js 20+ dan PostgreSQL 14+. Saat pertama kali jalan, database kosong otomatis diisi produk, hari pengiriman
(Selasa & Jumat, kapasitas 50) dan 16 minggu histori sintetis. `npm run seed:reset` **menghapus semua data** lalu mengulang
dari awal (ditolak saat `NODE_ENV=production`).

### Menjalankan tes

Tes yang memakai database butuh PostgreSQL kosong khusus tes (tes membuat dan menghapus skema sementaranya sendiri,
tidak menyentuh data lain). Tanpa `TEST_DATABASE_URL`, tes database dilewati.

```bash
docker compose exec db createdb -U tewiwi tewiwi_test
TEST_DATABASE_URL=postgresql://tewiwi:tewiwi@localhost:5432/tewiwi_test npm test
```

## Struktur

```
src/
  app.js, server.js, config.js
  db.js         koneksi PostgreSQL (pool) + transaksi
  migrate.js    menjalankan migrations/*.sql yang belum pernah dijalankan (npm run migrate)
  routes/       products, slots, orders, production, model
  services/     slotService (kapasitas), orderService, predictionService (model), briefService (GenAI)
  middleware/   adminAuth (header x-admin-key), rateLimit, security, errorHandler
  seed.js, seedData.js
migrations/     skema database (001_init.sql, ...)
test/, test-helpers/
docs/           arsitektur, model, panduan
```

## Mekanisme capacity management

- Kapasitas slot = override tanggal (`slot_overrides`) jika ada, kalau tidak kapasitas default hari itu (`delivery_days`).
- Terisi = jumlah `quantity` semua order pada tanggal itu yang statusnya bukan `Dibatalkan`.
- `status` slot = `full` jika sisa = 0. Slot `full` menolak order baru.
- `POST /api/orders` mengecek kapasitas dan menyimpan order dalam satu transaksi database, jadi dua order
  bersamaan tidak bisa melewati kapasitas.
- Jika ditolak (HTTP 409), response memuat `details.next_available` (slot berikutnya yang cukup), contohnya Jumat.
- Order hanya bisa untuk tanggal >= hari ini + `MIN_LEAD_DAYS` (default 2, karena produksi H-2).
- Membatalkan order (`Dibatalkan`) otomatis mengembalikan kapasitas. Mengaktifkan kembali order yang dibatalkan dicek ulang
  terhadap sisa kapasitas (409 `INSUFFICIENT_CAPACITY` jika tidak cukup).

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
  "customer_name": "Andi", "phone": "081234567890", "delivery_address": "Jl. Melati No. 12, Bekasi",
  "delivery_date": "2026-10-16",
  "items": [{ "product_id": 1, "quantity": 3 }, { "product_id": 3, "quantity": 2 }]
}'

# prediksi + brief (admin)
curl -X POST localhost:3000/api/predict -H 'x-admin-key: KUNCI' -H 'content-type: application/json' -d '{"delivery_date":"2026-10-16"}'
curl -X POST localhost:3000/api/production/brief -H 'x-admin-key: KUNCI' -H 'content-type: application/json' -d '{"delivery_date":"2026-10-16"}'
```

Respons `201` berisi order dan objek `payment` untuk layar "Pesanan diterima": `amount`, `bank_name`, `account_number`,
`account_name`, `transfer_note` (= kode order), `whatsapp_number`, dan `whatsapp_url` (tautan wa.me dengan pesan siap kirim).
Rekening dan nomor WhatsApp admin diatur lewat `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NUMBER`, `PAYMENT_ACCOUNT_NAME`,
`ADMIN_WHATSAPP` di `.env`; jika belum diisi nilainya `null`. `delivery_address` wajib (5-300 karakter) dan hanya terlihat oleh admin.

Dari React: `fetch('http://localhost:3000/api/slots')`. Jika `status === 'full'`, nonaktifkan tombol slot dan tawarkan
`next_available`. Atur `CORS_ORIGIN` sesuai alamat dev server React.

## Skema database

`products`, `delivery_days`, `slot_overrides`, `orders`, `order_items`, `order_history` (+ `schema_migrations`).
Definisi lengkap dan komentarnya ada di `migrations/001_init.sql`; perubahan skema dibuat sebagai file migrasi baru
(`002_...sql`), bukan dengan mengedit file lama.

## Model AI dan Generative AI

- **Preprocessing:** `order_history` + order nyata yang tanggalnya sudah lewat dijumlahkan per tanggal, per produk,
  lalu dipisah per hari pengiriman (semua Selasa, semua Jumat).
- **Model:** weighted moving average 6 slot terakhir + setengah kemiringan tren linear (`predictionService.js`).
- **Evaluasi:** walk-forward, 20% data terakhir sebagai data uji; dibandingkan baseline "ulangi slot sebelumnya".
  Hasil: `GET /api/model/evaluation`.
- **Brief:** berdasarkan order **terkonfirmasi** (`Dikonfirmasi`, `Diproduksi`, `Dikirim`) dan prediksi. Order `Baru` ikut
  memakai kapasitas slot, tetapi hanya dilaporkan sebagai `pending` (belum masuk target). Jika `ANTHROPIC_API_KEY` diisi,
  teks brief ditulis oleh Claude dari data terstruktur; jika kosong atau gagal, memakai template. Field `source`
  menunjukkan `llm` atau `template`.
- Histori default adalah **data sintetis**. Ganti dengan data asli lewat tabel `order_history`.

## Dokumentasi lengkap

- [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md): arsitektur, ERD dan skema database, mekanisme capacity management, status order.
- [docs/MODEL.md](docs/MODEL.md): preprocessing, algoritma, inference API, evaluasi dan batasannya, production brief.
- [docs/PANDUAN.md](docs/PANDUAN.md): panduan penggunaan untuk customer dan admin.
- [DEPLOY.md](DEPLOY.md): deploy ke server publik.

## Catatan

- Autentikasi admin memakai satu API key bersama: cukup untuk prototype, belum untuk produksi.
- Kapasitas slot aman untuk banyak order bersamaan karena dikunci di database (advisory lock per tanggal), jadi aman walau ada lebih dari satu instance aplikasi. Rate limit masih per proses.

## Produksi

Panduan lengkap (VPS + Nginx + HTTPS + backup, atau Docker) ada di [DEPLOY.md](DEPLOY.md).
Dengan `NODE_ENV=production`:

- Server menolak berjalan jika `ADMIN_API_KEY` kosong/default/kurang dari 24 karakter, `CORS_ORIGIN` kosong/`*`, atau `DATABASE_URL` kosong/tidak valid.
- Koneksi database wajib TLS terverifikasi secara bawaan (`DATABASE_SSL=verify` + `DATABASE_SSL_CA`, mis. sertifikat AWS RDS); mode lain memunculkan peringatan.
- Rate limit per IP: semua `/api` 120/menit, `POST /api/orders` 10 per 15 menit (`RATE_LIMIT_ORDERS`), cek kode order 30 per 15 menit, dan 10 admin key salah = diblokir 15 menit.
- Header keamanan (nosniff, X-Frame-Options, CSP, HSTS, no-store) dan `x-powered-by` dimatikan.
- Server hanya mendengarkan `127.0.0.1` (akses lewat Nginx) kecuali `HOST` diubah; berhenti dengan rapi saat `SIGTERM`.
- `GET /api/health` memeriksa koneksi database. Backup: automated backup/snapshot RDS dan `pg_dump` (lihat DEPLOY.md).
