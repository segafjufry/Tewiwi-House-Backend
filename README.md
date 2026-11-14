# Tewiwi Bakehouse

Monorepo untuk Tewiwi Bakehouse: aplikasi pemesanan roti dengan prediksi kebutuhan produksi.

## Struktur

```
tewiwi/
├── backend/   # API backend (Node.js + Express + PostgreSQL/Supabase)
├── frontend/  # Web app frontend (React + Vite + MUI + Supabase)
└── .gitignore
```

## Menjalankan

### Backend
```bash
cd backend
npm install
npm run seed      # buat data contoh + akun admin default (sekali saja)
npm run dev       # server jalan di http://localhost:3000
```
Detail konfigurasi lihat `backend/README.md` dan `backend/DEPLOY.md`.

### Frontend
```bash
cd frontend
npm install
npm run dev       # Vite dev server
```
Detail lihat `frontend/README.md`.

## Catatan

- Riwayat commit backend dan frontend tetap utuh; frontend digabungkan lewat `git subtree`.
- Untuk memperbarui frontend dari repo aslinya (`FarHK/Tewiwi-smartorder`):
  ```bash
  git subtree pull --prefix=frontend https://github.com/FarHK/Tewiwi-smartorder.git main
  ```
