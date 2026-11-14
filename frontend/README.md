# Tewiwi House — frontend React

Frontend untuk prototipe pemesanan Tewiwi House, dibangun dengan React, Vite, React Router, dan Material UI.

## Menjalankan proyek


```bash
npm install
npm run dev
```

Perintah pemeriksaan:

```bash
npm run lint
npm run build
```

## Struktur kode

```text
src/
├── assets/                 # Gambar dan aset statis
├── components/common/      # Komponen bersama, misalnya BrandHeader
├── config/                 # Konfigurasi tema dan informasi pembayaran demo
├── data/                   # Data produk dan daftar status pesanan
├── pages/
│   ├── customer/           # Form pemesanan dan halaman sukses
│   └── admin/              # Dashboard admin
├── services/               # Penyimpanan demo dan perhitungan slot pengiriman
├── utils/                  # Fungsi utilitas, misalnya format rupiah
├── App.jsx                 # Routing dan state aplikasi
├── App.css                 # Styling aplikasi yang saat ini masih global
└── main.jsx                # Entry point React
```

## Rute frontend

- `/` — formulir pemesanan customer
- `/sukses/:code` — ringkasan pesanan
- `/admin` — dashboard pesanan, kapasitas, dan produksi

## Batasan penting — prototipe, belum siap produksi

- Data pesanan masih disimpan pada `localStorage` browser melalui `services/demoOrderStorage.js`. Data tidak dibagikan antarperangkat atau antarbrowser dan dapat diubah oleh pemilik browser.
- Route `/admin` **belum dilindungi autentikasi**. Jangan gunakan untuk data pelanggan nyata atau dipublikasikan sebagai dashboard admin sebelum backend dan otorisasi ditambahkan.
- Kapasitas pengiriman dihitung di frontend. Untuk aplikasi nyata, backend/database harus menjadi sumber kebenaran dan memvalidasi kuota saat pesanan dibuat agar tidak terjadi pemesanan melebihi kapasitas.
- Informasi nomor rekening dan WhatsApp admin saat ini masih kosong pada `src/config/appConfig.js`. Isi hanya dengan detail bisnis yang benar sebelum demo pembayaran.
- Tidak ada backend atau database yang disertakan dalam paket frontend ini. Integrasi backend, login admin, penyimpanan terpusat, validasi server, dan fitur AI/ML perlu dikerjakan sebagai tahap terpisah sebelum produksi.

## Catatan pengembangan

Halaman customer dan admin sekarang sudah dipisahkan ke file yang berbeda, sementara aplikasi tetap memakai satu proyek frontend React. Ini mempermudah pengembangan tanpa membuat dua aplikasi frontend yang harus dirawat terpisah.
