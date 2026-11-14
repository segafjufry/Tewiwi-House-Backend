# Panduan Penggunaan

Panduan ini menjelaskan alur dari sisi customer dan admin sesuai perilaku backend.

## A. Untuk Customer

1. **Pilih produk dan jumlah.** Hanya produk yang aktif yang tampil.
2. **Pilih jadwal pengiriman.** Yang tersedia hanya hari pengiriman rutin (Selasa dan Jumat), paling cepat **2 hari dari hari ini** karena roti dibuat H-2 sebelum diantar.
   - Slot yang sudah penuh tidak bisa dipilih. Sistem menawarkan jadwal terdekat berikutnya.
   - Jika jumlah pesanan melebihi sisa kapasitas slot, pesanan ditolak dan sistem menyarankan slot lain yang cukup.
3. **Isi nama, nomor telepon, dan alamat pengiriman**, lalu kirim pesanan.
4. **Simpan kode order** (contoh `TW-A1B2C3`) yang muncul setelah pesanan berhasil.
5. **Cek status** kapan saja dengan memasukkan kode order. Status: Baru → Dikonfirmasi → Diproduksi → Dikirim (atau Dibatalkan).

## B. Untuk Admin

### Login

Semua fitur admin memerlukan autentikasi. Login lewat:

```
POST /api/auth/login
{ "username": "admin", "password": "tewiwi2025" }
```

Simpan token JWT dari respons. Sertakan di setiap request admin:
```
Authorization: Bearer <token>
```

Token berlaku **8 jam**. Login ulang jika sudah expired.

Di Postman, gunakan collection dan environment yang tersedia di folder `docs/` — token tersimpan otomatis setelah login.

### Manajemen Akun Admin

| Aksi | Endpoint |
|---|---|
| Lihat profil sendiri | `GET /api/auth/me` |
| Daftar semua admin | `GET /api/auth/admins` |
| Tambah admin baru | `POST /api/auth/admins` `{ username, password, display_name }` |
| Ganti password | `PATCH /api/auth/admins/:id/password` `{ old_password, new_password }` |
| Nonaktifkan / aktifkan admin | `PATCH /api/auth/admins/:id/active` `{ active: false/true }` |
| Reset password (lupa password) | `npm run reset-password -- <username> <password_baru>` |

### Alur Harian

1. **Lihat rekap** order per tanggal pengiriman (`GET /api/production/recap`).
2. **Konfirmasi order** yang masuk (`Baru` → `Dikonfirmasi`) **sebelum produksi dimulai (H-2)**. Hanya order terkonfirmasi yang masuk target produksi.
3. **Buka ringkasan produksi** untuk tanggal itu (`GET /api/production/summary?date=...`): jumlah order, prediksi, target per produk, dan estimasi tepung.
4. **Buat production brief** (`POST /api/production/brief`) untuk dibagikan ke tim dapur.
5. **Perbarui status** sesuai kemajuan: `Diproduksi` saat roti dibuat, `Dikirim` saat diantar.

### Situasi Umum

| Situasi | Tindakan |
|---|---|
| Ada bulk order / lonjakan pesanan | Naikkan kapasitas: `PUT /api/slots/:tanggal/capacity` `{ "capacity": 80 }` |
| Libur / tidak bisa antar di tanggal tertentu | Set kapasitas ke `0`. Batalkan order aktif dulu jika ada. |
| Ubah hari pengiriman rutin atau kapasitas default | `PUT /api/slots/config/days/:hari` `{ "capacity": 50, "active": true }` |
| Customer membatalkan | Ubah status menjadi `Dibatalkan` — kapasitas slot langsung kembali. |
| Aktifkan lagi order yang dibatalkan | Ubah statusnya; sistem cek ulang kapasitas (409 jika tidak cukup). |
| Produk tidak dijual lagi | Nonaktifkan (`active: false`), jangan dihapus. |
| Harga berubah | Update di produk; order lama tetap pakai harga saat dipesan. |
| Lupa password | Jalankan `npm run reset-password -- <username> <password_baru>` di terminal server. |
| Tambah admin baru | `POST /api/auth/admins` `{ username, password, display_name }` — hanya bisa dilakukan admin yang sudah login. |

### Membaca Peringatan di Ringkasan

- **"Slot penuh"** — tidak ada order baru lagi; target = order terkonfirmasi.
- **"Target produksi melebihi kapasitas"** — pertimbangkan menaikkan kapasitas slot.
- **"Order sudah melewati prediksi"** — permintaan lebih tinggi dari biasanya; siapkan bahan lebih.
- **"Order berstatus Baru belum masuk target"** — konfirmasi dulu sebelum produksi dimulai.

### Catatan Brief dari Generative AI

Field `source` pada hasil brief menunjukkan apakah teksnya ditulis AI (`llm`) atau template (`template`).
Selalu cocokkan angkanya dengan tabel `data` di respons sebelum dibagikan ke tim dapur.
