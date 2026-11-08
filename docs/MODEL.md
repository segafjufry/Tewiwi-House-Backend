# Dokumentasi Model: Demand Prediction dan Production Brief

## 1. Tujuan

Memperkirakan jumlah pesanan **per produk** untuk satu tanggal pengiriman mendatang (misalnya Jumat depan),
dari riwayat pesanan pada hari pengiriman yang sama. Hasilnya dipakai untuk menentukan target produksi dan estimasi bahan.

## 2. Data

| Sumber | Isi |
|---|---|
| `order_history` | Riwayat per tanggal, produk, dan jumlah. Bawaan: data sintetis 16 minggu (Selasa & Jumat, 11 produk). |
| `orders` + `order_items` | Order nyata yang terkonfirmasi — otomatis dicatat ke `order_history` saat seed demo orders, dan dipakai model. |

Data sintetis dibuat oleh `src/seedData.js` dengan pola dasar per produk dan hari, tren naik ~1% per slot,
dan noise acak ~±3 pcs dengan seed tetap (42).

### Produk dan Pola Demand Dasar

| Produk | Selasa | Jumat |
|---|---|---|
| Espresso Fudgy Brownies S | 8 | 9 |
| Espresso Fudgy Brownies L | 3 | 4 |
| Blueberry Cheese Crumble | 10 | 12 |
| Korean Garlic Creamcheese | 9 | 11 |
| Cranberry Walnut Creamcheese | 10 | 11 |
| Dusty Choco Hazelnut | 9 | 10 |
| Paket Alit (Semua Varian) | 5 | 6 |
| Salt Bread Original | 11 | 13 |
| Sei Cheese Salt Bread | 8 | 9 |
| Shokupan Loaf (Roti Tawar) | 6 | 7 |
| Country Bread | 5 | 6 |

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

Model statistik time series sederhana — tidak ada training terpisah, prediksi dihitung ulang dari data terbaru setiap kali dipanggil.

## 4. Inference API

`POST /api/predict` (admin)

```json
{ "delivery_date": "2026-11-07" }
```

```json
{
  "delivery_date": "2026-11-07",
  "model": "wma6_trend_v1",
  "per_product": [
    { "product_id": 4, "name": "Korean Garlic Creamcheese", "predicted_qty": 12, "history_points": 16 },
    { "product_id": 8, "name": "Salt Bread Original", "predicted_qty": 14, "history_points": 16 }
  ],
  "total_predicted": 110
}
```

`history_points` menunjukkan berapa titik data yang dipakai. Makin sedikit, makin tidak bisa dipercaya.

## 5. Evaluasi

`GET /api/model/evaluation` (admin)

**Metode: walk-forward.** 80% titik awal sebagai histori awal, 20% terakhir sebagai data uji.
Setiap titik uji diprediksi hanya dari titik sebelumnya.

**Metrik:** MAE (rata-rata selisih absolut, dalam pcs), MAPE, dan **baseline** "ulangi nilai slot sebelumnya".

Hasil pada data sintetis bawaan:

| Metrik | Model | Baseline |
|---|---|---|
| MAE | ~1.36 pcs | ~1.63 pcs |
| MAPE | ~11.9% | — |

Model ~17% lebih kecil kesalahannya dibanding baseline.

## 6. Batasan

- **Data sintetis.** Angka di atas hanya membuktikan alur evaluasi bekerja — bukan klaim akurasi untuk penjualan sungguhan.
- Data uji kecil, jadi angkanya bisa bergeser jika data berubah.
- Tidak memodelkan musiman tahunan, hari libur, promo, atau bulk order.
- Tiap produk diprediksi sendiri-sendiri, tanpa melihat hubungan antarproduk.
- Produk baru dengan < 3 titik data hanya mendapat rata-rata (atau 0 jika kosong).

### Mengganti dengan Data Asli

Masukkan riwayat ke `order_history`:

```sql
INSERT INTO order_history (delivery_date, product_id, quantity) VALUES ('2026-09-02', 4, 12);
```

Jika memakai data asli, set `SEED_BASE_DATA=false` agar data sintetis tidak dibuat ulang saat database kosong.

## 7. Dari Prediksi ke Target Produksi

`GET /api/production/summary?date=YYYY-MM-DD` menggabungkan order dan prediksi:

| Kondisi slot | Target produksi per produk |
|---|---|
| Masih terbuka | `max(order terkonfirmasi, prediksi)` |
| Penuh | order terkonfirmasi saja |

- Hanya order terkonfirmasi (`Dikonfirmasi`, `Diproduksi`, `Dikirim`) yang masuk target.
- Order `Baru` dilaporkan terpisah (`pending`) dengan peringatan.
- Estimasi tepung = target × `flour_grams` produk.

## 8. Generative AI: Production Brief

`POST /api/production/brief` dengan `{ "delivery_date": "2026-11-07" }`.

- Data terstruktur dari bagian 7 dikirim ke Claude (`ANTHROPIC_MODEL`, default `claude-haiku-5-5`).
- Jika `ANTHROPIC_API_KEY` kosong atau gagal (timeout 20 detik), sistem memakai **template** tetap.
- Field `source` bernilai `llm` atau `template`. Field `data` selalu menyertakan angka mentahnya.

Contoh keluaran template:

```
PRODUCTION BRIEF - Jumat, 2026-11-07
Mulai produksi: 2026-11-05 (H-2)
Kapasitas slot: 50 pcs | Terisi: 46 pcs (terkonfirmasi 36 dari 3 order, belum dikonfirmasi 10 pcs)

Rincian produk
- Korean Garlic Creamcheese: 10 terkonfirmasi, prediksi 12, target produksi 12 pcs
- Salt Bread Original: 12 terkonfirmasi, prediksi 14, target produksi 14 pcs
- Dusty Choco Hazelnut: 6 terkonfirmasi, prediksi 10, target produksi 10 pcs
- Country Bread: 10 terkonfirmasi, prediksi 6, target produksi 10 pcs

Total target: 46 pcs
Estimasi tepung: 10.24 kg

Catatan
- 1 order (10 pcs) masih berstatus Baru dan belum masuk target. Konfirmasi sebelum produksi dimulai.
```
