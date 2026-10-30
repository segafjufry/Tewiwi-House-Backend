# Panduan Penggunaan

Panduan ini menjelaskan alur dari sisi customer dan admin sesuai perilaku backend. Nama tombol dan tampilan menyesuaikan frontend yang dibuat.

## A. Untuk customer

1. **Pilih produk dan jumlah.** Hanya produk yang aktif yang tampil.
2. **Pilih jadwal pengiriman.** Yang tersedia hanya hari pengiriman rutin (misalnya Selasa dan Jumat), dan paling cepat **2 hari dari hari ini** karena roti dibuat dua hari sebelum diantar.
   - Slot yang sudah penuh tidak bisa dipilih. Sistem menawarkan jadwal terdekat berikutnya (misalnya Jumat).
   - Jika jumlah pesanan Anda melebihi sisa kapasitas slot, pesanan ditolak dan sistem menyarankan slot lain yang cukup. Kurangi jumlahnya atau pilih slot yang disarankan.
3. **Isi nama dan nomor telepon** (angka, boleh diawali `+`, 7 sampai 19 karakter), lalu kirim pesanan.
4. **Simpan kode order** (contoh `TW-A1B2C3`) yang muncul setelah pesanan berhasil.
5. **Cek status** kapan saja dengan memasukkan kode order. Status: Baru, Dikonfirmasi, Diproduksi, Dikirim, atau Dibatalkan.

Jika muncul pesan "Terlalu banyak pesanan dari alamat ini", tunggu beberapa menit lalu coba lagi.

## B. Untuk admin

Semua fitur admin memerlukan **admin key**. Jangan membagikannya dan jangan menyimpannya di kode frontend. Salah memasukkan key 10 kali akan memblokir sementara (15 menit).

### Alur harian

1. **Lihat rekap** order per tanggal pengiriman (`GET /api/production/recap`) dan pilih tanggal yang akan datang.
2. **Konfirmasi order** yang masuk (status `Baru` menjadi `Dikonfirmasi`) **sebelum produksi dimulai (H-2)**. Hanya order terkonfirmasi yang masuk target produksi.
3. **Buka ringkasan produksi** untuk tanggal itu (`GET /api/production/summary?date=...`): jumlah order, prediksi, target per produk, dan estimasi tepung. Perhatikan bagian peringatan.
4. **Buat production brief** (`POST /api/production/brief`) untuk dibagikan ke tim dapur.
5. **Perbarui status** sesuai kemajuan: `Diproduksi` saat roti dibuat, `Dikirim` saat diantar.

### Situasi umum

| Situasi | Tindakan |
|---|---|
| Ada bulk order atau lonjakan pesanan | Naikkan kapasitas tanggal itu: `PUT /api/slots/:tanggal/capacity` `{ "capacity": 80 }`. Kembalikan ke default dengan `DELETE` pada endpoint yang sama. |
| Libur / tidak bisa mengirim di tanggal tertentu | Set kapasitas tanggal itu ke `0`. Kapasitas tidak bisa lebih kecil dari jumlah order aktif, jadi batalkan atau pindahkan order dulu. |
| Mengubah hari pengiriman rutin atau kapasitas default | `PUT /api/slots/config/days/:hari` `{ "capacity": 50, "active": true }` (0 = Minggu ... 6 = Sabtu). |
| Customer membatalkan | Ubah status menjadi `Dibatalkan`; kapasitas slot langsung kembali. |
| Ingin mengaktifkan lagi order yang dibatalkan | Ubah statusnya. Jika slot sudah penuh, sistem menolak (409) dan menyarankan slot lain. |
| Produk tidak dijual lagi | Nonaktifkan (`active: false`), jangan dihapus. Produk yang sudah punya order tidak bisa dihapus. |
| Harga berubah | Ubah di produk; order lama tetap memakai harga saat dipesan. |
| Prediksi terasa tidak masuk akal | Cek `GET /api/model/evaluation` dan jumlah data (`history_points`). Prediksi dari sedikit data tidak bisa dipercaya; tentukan target sendiri. |

### Membaca peringatan di ringkasan

- **"Slot penuh"**: tidak ada order baru lagi; target = order terkonfirmasi. Customer baru diarahkan ke slot berikutnya.
- **"Target produksi melebihi kapasitas"**: prediksi atau order lebih besar dari kapasitas slot; pertimbangkan menaikkan kapasitas atau mengurangi produksi.
- **"Order sudah melewati prediksi"**: permintaan lebih tinggi dari biasanya; siapkan bahan lebih.
- **"Order berstatus Baru belum masuk target"**: konfirmasi dulu, atau jumlahnya tidak ikut diproduksi.

### Catatan penggunaan brief dari Generative AI

Field `source` pada hasil brief menunjukkan apakah teksnya ditulis AI (`llm`) atau template (`template`). Selalu cocokkan angkanya dengan tabel `data` di respons sebelum dibagikan ke tim dapur.
