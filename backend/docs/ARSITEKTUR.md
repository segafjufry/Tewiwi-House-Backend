# Arsitektur Sistem, Skema Database, dan Capacity Management

## 1. Gambaran Sistem

```mermaid
flowchart LR
  C[Customer<br/>browser] --> F[Frontend React]
  A[Admin<br/>browser] --> F
  F -- "REST JSON /api" --> B[Backend Express.js]
  B --> D[(PostgreSQL<br/>Supabase)]
  B -. "opsional, jika ANTHROPIC_API_KEY diisi" .-> G[Claude API<br/>production brief]
```

Backend memakai pola **route → service → database**:

| Lapisan | Folder | Tugas |
|---|---|---|
| Route | `src/routes/` | Menerima request HTTP, memeriksa hak akses (publik/admin), memanggil service. |
| Service | `src/services/` | Aturan bisnis: `slotService`, `orderService`, `predictionService`, `briefService`, `adminService`, `paymentService`. |
| Middleware | `src/middleware/` | Autentikasi admin (JWT + API key), rate limit, header keamanan, penanganan error. |
| Database | `src/db.js`, `src/migrate.js`, `migrations/` | Koneksi PostgreSQL (pool), transaksi, dan skema (file migrasi SQL). |

Tanggal pengiriman bertipe `DATE` di PostgreSQL dan selalu dibaca aplikasi sebagai teks `YYYY-MM-DD` (zona waktu Asia/Jakarta),
bukan objek `Date`, supaya tidak bergeser karena zona waktu.

**Hak akses:**
- **Publik** — lihat produk, lihat slot, buat order, lacak order dengan kode
- **Admin** — semua endpoint publik + kelola order, produksi, produk, slot, dan manajemen akun admin

Admin autentikasi lewat JWT token dari `POST /api/auth/login`, atau header `x-admin-key` (backward-compatible).

## 2. Skema Database

```mermaid
erDiagram
  products ||--o{ order_items : "dipesan"
  products ||--o{ order_history : "riwayat"
  orders ||--|{ order_items : "berisi"

  admins {
    int id PK
    text username UK
    text password_hash "bcrypt hash"
    text display_name
    boolean active
    timestamptz created_at
    timestamptz last_login
  }
  products {
    int id PK
    text name
    int price "Rupiah, >= 0"
    int flour_grams "tepung per pcs"
    boolean active
  }
  delivery_days {
    smallint weekday PK "0=Minggu ... 6=Sabtu"
    int capacity "kapasitas default per slot"
    boolean active
  }
  slot_overrides {
    date delivery_date PK
    int capacity "menggantikan default untuk 1 tanggal"
  }
  orders {
    int id PK
    text code UK "contoh TW-A1B2C3"
    text customer_name
    text phone
    text delivery_address "alamat pengiriman"
    date delivery_date
    text status "default Baru"
    timestamptz created_at
  }
  order_items {
    int id PK
    int order_id FK
    int product_id FK
    int quantity "> 0"
    int unit_price "harga saat order dibuat"
  }
  order_history {
    int id PK
    date delivery_date
    int product_id FK
    int quantity
  }
```

Catatan desain:

- **Skema dibuat lewat migrasi** (`migrations/001_init.sql` dst.), dijalankan oleh `npm run migrate` atau otomatis saat server start.
  Perubahan berikutnya = file baru (`002_...sql`), bukan mengedit file lama.
- Kolom `status` dibatasi constraint `CHECK` (Baru, Dikonfirmasi, Diproduksi, Dikirim, Dibatalkan).
- **Slot tidak disimpan sebagai tabel.** Slot dihitung dari `delivery_days` dan `slot_overrides`, lalu dikurangi jumlah order aktif.
- `order_items.unit_price` menyimpan harga **saat order dibuat** — mengubah harga produk tidak mengubah order lama.
- `order_history` berisi data historis untuk melatih model prediksi. Order nyata yang terkonfirmasi juga dicatat ke sini.
- `ON DELETE CASCADE` hanya pada `order_items`. Produk yang sudah dipakai tidak bisa dihapus (409); nonaktifkan dengan `active: false`.
- Tabel `admins` menyimpan password sebagai **bcrypt hash** (12 rounds). Password asli tidak bisa dibaca balik dari database.
- Semua tabel mengaktifkan **Row Level Security (RLS)** karena database di-host di Supabase.

## 3. Autentikasi Admin

```mermaid
sequenceDiagram
  actor Admin
  participant API
  participant DB

  Admin->>API: POST /api/auth/login {username, password}
  API->>DB: SELECT * FROM admins WHERE username = ?
  DB-->>API: admin row
  API->>API: bcrypt.compare(password, hash)
  API-->>Admin: 200 { token (JWT, 8 jam), admin info }

  Admin->>API: GET /api/orders (Authorization: Bearer <token>)
  API->>API: jwt.verify(token, ADMIN_API_KEY)
  API->>DB: query orders
  DB-->>API: rows
  API-->>Admin: 200 { data: [...] }
```

JWT ditandatangani dengan `ADMIN_API_KEY` dari `.env`. Token berlaku **8 jam**.
Salah memasukkan kredensial 10 kali = IP diblokir 15 menit (rate limit).

## 4. Mekanisme Capacity Management

**Rumus** (`src/services/slotService.js`):

```
kapasitas = slot_overrides[tanggal] jika ada, kalau tidak delivery_days[hari].capacity
terisi    = jumlah quantity semua order pada tanggal itu yang statusnya BUKAN Dibatalkan
sisa      = max(0, kapasitas - terisi)
status    = "available" jika sisa > 0, selain itu "full"
```

Kapasitas dihitung per **jumlah roti**, bukan per jumlah order.

**Alur membuat order** (`POST /api/orders`), semuanya dalam satu transaksi database:

```mermaid
flowchart TD
  S([Customer kirim order]) --> V{Data valid?}
  V -- tidak --> E400[400 VALIDATION_ERROR]
  V -- ya --> H{Tanggal = hari pengiriman?}
  H -- tidak --> E422a[422 INVALID_SLOT]
  H -- ya --> L{Tanggal >= hari ini + 2?}
  L -- tidak --> E422b[422 TOO_SOON]
  L -- ya --> P{Semua produk aktif?}
  P -- tidak --> E422c[422 INVALID_PRODUCT]
  P -- ya --> K{Sisa slot >= total roti?}
  K -- tidak --> E409["409 SLOT_FULL / INSUFFICIENT_CAPACITY + next_available"]
  K -- ya --> OK[Simpan order, 201 + kode order]
```

- **Order bersamaan aman** — pengecekan dan penyimpanan dalam satu transaksi dengan advisory lock per tanggal.
- **Pesanan minimal H+2** karena produksi dilakukan H-2 (`MIN_LEAD_DAYS`).
- **Membatalkan order** langsung mengembalikan kapasitas.
- **Bulk order / libur** — admin ubah kapasitas satu tanggal lewat `PUT /api/slots/:date/capacity`.

## 5. Status Order

```mermaid
stateDiagram-v2
  [*] --> Baru
  Baru --> Dikonfirmasi
  Dikonfirmasi --> Diproduksi
  Diproduksi --> Dikirim
  Baru --> Dibatalkan
  Dikonfirmasi --> Dibatalkan
  Diproduksi --> Dibatalkan
```

| Status | Memakai kapasitas slot | Masuk target production brief |
|---|---|---|
| Baru | ya | tidak (dilaporkan sebagai "belum dikonfirmasi") |
| Dikonfirmasi, Diproduksi, Dikirim | ya | ya |
| Dibatalkan | tidak | tidak |
