# Tewiwi Bakehouse – Backend (Express.js + PostgreSQL)

REST API untuk Smart Order & Production Scheduling — Tewiwi Bakehouse Artisan Sourdough.

## Menjalankan

```bash
npm install
cp .env.example .env        # isi DATABASE_URL dan variabel lainnya
npm run migrate             # buat tabel (atau otomatis saat server start)
npm run dev                 # jalan di http://localhost:3000
npm run seed                # opsional: isi data contoh + akun admin default
npm run seed:orders         # tambah 7 order contoh walau tabel orders sudah berisi
```

Butuh Node.js 20+ dan PostgreSQL 14+ (atau Supabase).

Saat pertama kali jalan, database kosong otomatis diisi produk, hari pengiriman (Selasa & Jumat, kapasitas 50),
dan 16 minggu histori sintetis. `npm run seed:reset` **menghapus semua data** lalu mengulang dari awal
(ditolak saat `NODE_ENV=production`).

## Struktur

```
src/
  app.js, server.js, config.js
  db.js           koneksi PostgreSQL (pool) + transaksi
  migrate.js      menjalankan migrations/*.sql yang belum pernah dijalankan
  reset-password.js  reset password admin dari terminal (darurat)
  routes/         products, slots, orders, production, model, auth
  services/       slotService, orderService, predictionService, briefService, adminService, paymentService
  middleware/     adminAuth (JWT + API key), rateLimit, security, errorHandler
  seed.js, seedData.js
migrations/       skema database (001_init.sql, ...)
test/, test-helpers/
docs/             arsitektur, model, panduan, Postman collection & environment
```

## Autentikasi Admin

Admin login lewat endpoint `POST /api/auth/login` dengan username dan password, lalu mendapat **JWT token** yang berlaku 8 jam.
Token dikirim di header `Authorization: Bearer <token>` untuk semua request admin.

API key lama (`x-admin-key`) tetap didukung untuk backward-compatibility.

### Akun default (setelah `npm run seed`)

| Username | Password | Display Name |
|---|---|---|
| `admin` | `tewiwi2025` | Admin Tewiwi |

Segera ganti password setelah login pertama lewat `PATCH /api/auth/admins/1/password`.

### Lupa password?

```bash
npm run reset-password -- <username> <password_baru>

# Contoh
npm run reset-password -- admin passwordbaru123
```

## Produk

Produk yang tersedia sesuai menu Tewiwi Bakehouse:

| Produk | Harga |
|---|---|
| Espresso Fudgy Brownies S (10x5) | Rp 18.000 |
| Espresso Fudgy Brownies L (10x20) | Rp 62.000 |
| Blueberry Cheese Crumble | Rp 23.000 |
| Korean Garlic Creamcheese | Rp 20.000 |
| Cranberry Walnut Creamcheese | Rp 23.000 |
| Dusty Choco Hazelnut | Rp 23.000 |
| Paket Alit (Semua Varian) | Rp 60.000 |
| Salt Bread Original | Rp 18.000 |
| Sei Cheese Salt Bread (Sei Sapi + Cheese) | Rp 23.000 |
| Shokupan Loaf (Roti Tawar) | Rp 25.000 |
| Country Bread | Rp 38.000 |

## Endpoint

Semua response sukses berbentuk `{ "data": ... }`, error berbentuk `{ "error": { code, message, details } }`.

### 🔐 Auth

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | /api/auth/login | publik | Login, mendapat JWT token |
| GET | /api/auth/me | admin | Info akun yang sedang login |
| GET | /api/auth/admins | admin | Daftar semua admin |
| POST | /api/auth/admins | admin | Buat admin baru |
| PATCH | /api/auth/admins/:id/password | admin | Ganti password |
| PATCH | /api/auth/admins/:id/active | admin | Aktifkan / nonaktifkan admin |

### 📦 Products

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | /api/products | publik | Produk aktif (`?all=true` + admin = semua) |
| GET | /api/products/:id | publik | Detail produk |
| POST | /api/products | admin | Tambah produk baru |
| PUT | /api/products/:id | admin | Update produk |
| DELETE | /api/products/:id | admin | Hapus produk (409 jika sudah dipakai, nonaktifkan saja) |

### 📅 Slots

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | /api/slots?count=8 | publik | Slot mendatang: capacity, used, left, status |
| GET | /api/slots/:date | publik | Satu slot (YYYY-MM-DD) |
| GET | /api/slots/config | admin | Hari pengiriman dan override |
| PUT | /api/slots/config/days/:weekday | admin | `{capacity, active}` (0=Minggu ... 6=Sabtu) |
| PUT | /api/slots/:date/capacity | admin | Override kapasitas satu tanggal |
| DELETE | /api/slots/:date/capacity | admin | Hapus override, kembali ke default |

### 🛒 Orders

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | /api/orders | publik | Buat order baru |
| GET | /api/orders/track/:code | publik | Lacak status via kode order |
| GET | /api/orders?date=&status= | admin | Daftar order (filter opsional) |
| GET | /api/orders/:id | admin | Detail order |
| PATCH | /api/orders/:id/status | admin | Update status order |

### 🏭 Production

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | /api/production/recap?from=&to= | admin | Rekap order per tanggal pengiriman |
| GET | /api/production/summary?date= | admin | Order vs prediksi vs target, estimasi tepung |
| POST | /api/production/brief | admin | `{delivery_date}` → production brief (AI/template) |

### 🤖 Model

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | /api/predict | admin | `{delivery_date}` → prediksi demand per produk |
| GET | /api/model/evaluation | admin | MAE, MAPE, baseline pada data uji |

### ❤️ Health

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | /api/health | publik | Cek status server dan database |

## Mekanisme Capacity Management

- Kapasitas slot = override tanggal (`slot_overrides`) jika ada, kalau tidak kapasitas default hari itu (`delivery_days`).
- Terisi = jumlah `quantity` semua order yang statusnya bukan `Dibatalkan`.
- `POST /api/orders` mengecek kapasitas dan menyimpan order dalam satu transaksi database (advisory lock per tanggal).
- Jika ditolak (HTTP 409), response memuat `details.next_available` (slot berikutnya yang cukup).
- Order hanya bisa untuk tanggal >= hari ini + `MIN_LEAD_DAYS` (default 2, karena produksi H-2).
- Membatalkan order otomatis mengembalikan kapasitas.

## Postman

File Postman tersedia di folder `docs/`:

| File | Keterangan |
|---|---|
| `tewiwi-api.postman_collection.json` | Semua endpoint lengkap dengan contoh request |
| `tewiwi-api.postman_environment.json` | Environment variable (base_url, token, credentials) |

Import keduanya ke Postman, pilih environment **"Tewiwi Bakehouse - Local"**, lalu jalankan request
**Login** — token otomatis tersimpan ke `{{token}}` lewat script Tests.

## Skema Database

`products`, `delivery_days`, `slot_overrides`, `orders`, `order_items`, `order_history`, `admins` (+ `schema_migrations`).

Definisi lengkap ada di `migrations/`. Perubahan skema dibuat sebagai file migrasi baru, bukan mengedit file lama.

## Model AI dan Generative AI

- **Model:** weighted moving average 6 slot terakhir + setengah kemiringan tren linear (`predictionService.js`).
- **Evaluasi:** walk-forward, 20% data terakhir sebagai data uji; MAE ~1.36 pcs vs baseline 1.63 pcs.
- **Brief:** berdasarkan order terkonfirmasi + prediksi. Jika `ANTHROPIC_API_KEY` diisi, teks ditulis oleh Claude;
  jika kosong atau gagal, memakai template. Field `source` menunjukkan `llm` atau `template`.

## Dokumentasi Lengkap

- [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md) — arsitektur, ERD, skema database, capacity management, status order
- [docs/MODEL.md](docs/MODEL.md) — preprocessing, algoritma prediksi, evaluasi, production brief
- [docs/PANDUAN.md](docs/PANDUAN.md) — panduan penggunaan untuk customer dan admin
- [DEPLOY.md](DEPLOY.md) — deploy ke server publik (VPS + Nginx + HTTPS)

## Produksi

Dengan `NODE_ENV=production`:

- Server menolak berjalan jika `ADMIN_API_KEY` kosong/default/kurang dari 24 karakter, `CORS_ORIGIN` kosong/`*`,
  atau `DATABASE_URL` kosong/tidak valid.
- Koneksi database wajib TLS (`DATABASE_SSL=verify` + `DATABASE_SSL_CA`).
- Rate limit per IP: semua `/api` 120/menit, `POST /api/orders` 10 per 15 menit, cek kode order 30 per 15 menit,
  10 salah admin key = diblokir 15 menit.
- Header keamanan (nosniff, X-Frame-Options, CSP, HSTS) dan `x-powered-by` dimatikan.
- Server hanya mendengarkan `127.0.0.1` kecuali `HOST` diubah; berhenti dengan rapi saat `SIGTERM`.
