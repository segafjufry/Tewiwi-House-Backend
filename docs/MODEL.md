# Dokumentasi Model: Demand Prediction dan Production Brief

## 1. Tujuan

Memperkirakan jumlah pesanan **per produk** untuk satu tanggal pengiriman mendatang (misalnya Jumat depan), dari riwayat pesanan pada hari pengiriman yang sama. Hasilnya dipakai untuk menentukan target produksi dan estimasi bahan.

## 2. Data

| Sumber | Isi |
|---|---|
| `order_history` | Riwayat per tanggal, produk, dan jumlah. Bawaan: **data sintetis** 16 minggu (Selasa dan Jumat, 4 produk). |
| `orders` + `order_items` | Order nyata yang tanggal pengirimannya **sudah lewat** dan tidak dibatalkan. Otomatis ikut dipakai. |

Data sintetis dibuat oleh `src/seedData.js` dengan pola dasar per produk dan hari, tren naik sekitar 1% per slot pengiriman, dan noise acak sekitar ±3 pcs dengan seed tetap (42), sehingga hasilnya selalu sama. Soal memang tidak menyediakan data historis bisnis, jadi data ini hanya representasi untuk membuktikan alur bekerja.

### Preprocessing (`seriesFor`)

1. Gabungkan `order_history` dengan order nyata yang tanggalnya sudah lewat.
2. Buang order berstatus `Dibatalkan`.
3. Jumlahkan per **tanggal** untuk satu produk.
4. Ambil hanya tanggal dengan **hari yang sama** dengan target (semua Selasa untuk memprediksi Selasa).
5. Hasilnya deret waktu per produk per hari pengiriman, berurutan dari yang terlama.

## 3. Algoritma (`wma6_trend_v1`)

Untuk deret `s` dengan `n` titik:

- `n = 0` → prediksi 0. `n < 3` → rata-rata `s`.
- Selain itu, ambil maksimal 6 titik terakhir `w` (terlama ke terbaru):
  1. **Weighted moving average:** bobot 1, 2, ..., k (titik terbaru berbobot paling besar).
  2. **Kemiringan tren:** koefisien regresi linear (OLS) dari `w` terhadap urutan waktu.
  3. **Prediksi = `max(0, WMA + 0.5 × kemiringan)`**, lalu dibulatkan.

Ini model statistik time series yang sederhana: tidak ada proses training terpisah, prediksi dihitung ulang dari data terbaru setiap kali dipanggil. Konstanta `WINDOW = 6` dan faktor `0.5` ada di `src/services/predictionService.js`.

## 4. Inference API

`POST /api/predict` (admin, header `x-admin-key`)

```json
{ "delivery_date": "2026-10-23" }
```

```json
{
  "delivery_date": "2026-10-23",
  "model": "wma6_trend_v1",
  "per_product": [
    { "product_id": 1, "name": "Sourdough Original", "predicted_qty": 15, "history_points": 16 },
    { "product_id": 2, "name": "Roti Gandum Utuh", "predicted_qty": 13, "history_points": 16 }
  ],
  "total_predicted": 51
}
```

`history_points` menunjukkan berapa titik data yang dipakai. Makin sedikit, makin tidak bisa dipercaya.

## 5. Evaluasi

`GET /api/model/evaluation` (admin)

**Metode: walk-forward.** Untuk tiap kombinasi produk dan hari pengiriman, 80% titik awal dipakai sebagai histori awal dan 20% terakhir sebagai data uji. Setiap titik uji diprediksi hanya dari titik sebelumnya (tanpa melihat masa depan), lalu dibandingkan dengan nilai aktual.

**Metrik:** MAE (rata-rata selisih absolut, dalam pcs), MAPE (rata-rata persentase kesalahan, hanya untuk nilai aktual > 0), dan **baseline**: "ulangi nilai slot sebelumnya".

Hasil pada data sintetis bawaan:

| Metrik | Model | Baseline |
|---|---|---|
| MAE | 1,36 pcs | 1,63 pcs |
| MAPE | 11,9% | tidak dihitung |
| Jumlah titik uji | 32 | 32 |

Model sekitar 17% lebih kecil kesalahannya dibanding baseline.

## 6. Batasan yang harus dinyatakan

- **Data sintetis.** Angka di atas menunjukkan alur evaluasi bekerja pada data yang polanya kita tentukan sendiri. Itu **bukan** klaim akurasi untuk penjualan sungguhan. Ganti dengan data asli lalu evaluasi ulang.
- **Data uji kecil** (32 titik), jadi angkanya bisa bergeser cukup banyak jika datanya berubah.
- Tidak memodelkan musiman tahunan, hari libur, promo, atau bulk order. Lonjakan seperti itu perlu ditangani admin lewat kapasitas khusus tanggal.
- Tiap produk dan hari diprediksi sendiri-sendiri, tanpa melihat hubungan antarproduk.
- Produk baru dengan kurang dari 3 titik data hanya mendapat rata-rata (atau 0 jika kosong).
- MAPE tidak stabil jika angka aktual kecil.

### Mengganti dengan data asli

Masukkan riwayat ke `order_history` (satu baris per tanggal, produk, dan jumlah):

```sql
INSERT INTO order_history (delivery_date, product_id, quantity) VALUES ('2026-09-02', 1, 12);
```

Jika memakai data asli, hapus data sintetis dan set `SEED_BASE_DATA=false` agar tidak dibuat ulang saat database kosong.

## 7. Dari prediksi ke target produksi

`GET /api/production/summary?date=YYYY-MM-DD` menggabungkan order dan prediksi per produk:

| Kondisi slot | Target produksi per produk |
|---|---|
| Masih terbuka | `max(order terkonfirmasi, prediksi)` |
| Penuh | order terkonfirmasi (tidak ada order baru lagi) |

- **Hanya order terkonfirmasi** (`Dikonfirmasi`, `Diproduksi`, `Dikirim`) yang masuk target. Order `Baru` dilaporkan terpisah (`pending`) dengan peringatan agar dikonfirmasi sebelum produksi dimulai (H-2).
- Estimasi tepung = target × `flour_grams` produk. Bahan lain belum dihitung.
- Peringatan otomatis: slot penuh (dan slot alternatifnya), target melebihi kapasitas, order terkonfirmasi sudah melewati prediksi, ada order `Baru`.

## 8. Generative AI: production brief

`POST /api/production/brief` (admin) dengan `{ "delivery_date": "2026-10-23" }`.

- Data terstruktur dari bagian 7 dikirim ke Claude (model dari `ANTHROPIC_MODEL`, bawaan `claude-haiku-5-5`) dengan instruksi: tulis brief singkat berbahasa Indonesia untuk tim dapur, **gunakan hanya angka dari data**. Instruksi ini mengarahkan model, tetapi tidak ada pemeriksaan otomatis bahwa angkanya cocok; admin tetap perlu membaca hasilnya.
- Jika `ANTHROPIC_API_KEY` kosong atau pemanggilan gagal (timeout 20 detik), sistem memakai **template** tetap. Field `source` bernilai `llm` atau `template`, dan `data` selalu menyertakan angka mentahnya.

Contoh keluaran template:

```
PRODUCTION BRIEF - Jumat, 2026-10-23
Mulai produksi: 2026-10-21 (H-2)
Kapasitas slot: 50 pcs | Terisi: 50 pcs (terkonfirmasi 40 dari 2 order, belum dikonfirmasi 10 pcs)

Rincian produk
- Sourdough Original: 14 terkonfirmasi (+10 belum dikonfirmasi), prediksi 15, target produksi 14 pcs
- Roti Gandum Utuh: 6 terkonfirmasi, prediksi 13, target produksi 6 pcs
- Cinnamon Roll: 16 terkonfirmasi, prediksi 13, target produksi 16 pcs
- Milk Bun: 4 terkonfirmasi, prediksi 10, target produksi 4 pcs

Total target: 40 pcs
Estimasi tepung: 7.48 kg

Catatan
- 1 order (10 pcs) masih berstatus Baru dan belum masuk target. Konfirmasi sebelum produksi dimulai (2026-10-21).
- Slot penuh. Pelanggan baru diarahkan ke Selasa 2026-10-27.
- Cinnamon Roll: order sudah melewati prediksi.
```
