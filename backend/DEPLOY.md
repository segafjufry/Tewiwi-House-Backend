# Panduan Deploy ke Server Publik (PostgreSQL)

Arsitektur: **Internet → Nginx (HTTPS) → Node (127.0.0.1:3000) → PostgreSQL**.
Contoh memakai domain `api.contoh.com` dan server Ubuntu 22.04/24.04 (mis. AWS EC2). Ganti sesuai kebutuhan Anda.

> Catatan: panduan ini belum diuji di server sungguhan. Ikuti langkahnya sambil memeriksa hasil tiap langkah.

## 1. Siapkan database

Pilih salah satu.

### A. AWS RDS PostgreSQL (database terkelola)

1. **Buat instance:** RDS → *Create database* → PostgreSQL (versi 14 atau lebih baru). Pilih template dan ukuran terkecil yang cukup
   (mis. `db.t4g.micro`, storage 20 GB). Cek ketentuan free tier dan biaya terbaru, lalu pasang **budget alert** di AWS Billing.
2. **Jaringan:** satu VPC dengan server aplikasi, **Public access: No**.
3. **Security group RDS:** inbound *PostgreSQL / TCP 5432* dengan sumber = **security group server aplikasi** (bukan `0.0.0.0/0`).
4. **Nama database awal:** `tewiwi`. Simpan password master di password manager.
5. **Backup:** biarkan *automated backups* aktif (retention minimal 7 hari).
6. **Wajibkan TLS:** buat custom parameter group dengan `rds.force_ssl = 1`, pasang ke instance, lalu reboot instance
   (parameter ini statis, baru berlaku setelah reboot).
7. **Buat user khusus aplikasi** (jangan pakai user master untuk aplikasi). Dari server aplikasi, pasang klien lalu masuk sebagai master:
   ```bash
   sudo apt install -y postgresql-client
   psql "host=<ENDPOINT-RDS> port=5432 dbname=tewiwi user=<USER-MASTER> sslmode=require"
   ```
   ```sql
   CREATE USER tewiwi_app WITH PASSWORD 'GANTI_PASSWORD_KUAT';
   GRANT tewiwi_app TO <USER-MASTER>;   -- diperlukan RDS sebelum mengganti pemilik
   ALTER DATABASE tewiwi OWNER TO tewiwi_app;
   ALTER SCHEMA public OWNER TO tewiwi_app;
   ```
8. **Unduh sertifikat CA RDS** agar koneksi bisa diverifikasi:
   ```bash
   sudo mkdir -p /opt/tewiwi-backend/certs
   sudo curl -o /opt/tewiwi-backend/certs/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   ```
9. **Isi `.env`** (langkah 3):
   ```
   DATABASE_URL=postgresql://tewiwi_app:PASSWORD@<ENDPOINT-RDS>:5432/tewiwi
   DATABASE_SSL=verify
   DATABASE_SSL_CA=/opt/tewiwi-backend/certs/global-bundle.pem
   ```
   Password berisi karakter khusus harus di-encode (`@` → `%40`, `#` → `%23`, `/` → `%2F`).

Jika koneksi gagal: periksa security group (sumber harus security group server aplikasi), endpoint, dan apakah `DATABASE_SSL_CA` menunjuk file yang ada.
Setelah tidak dipakai, hapus instance (atau ambil snapshot lalu hapus) agar tidak ditagih.

### B. PostgreSQL di server yang sama (lebih murah, backup jadi tanggung jawab Anda)

```bash
sudo apt install -y postgresql
sudo -u postgres psql <<'SQL'
CREATE USER tewiwi_app WITH PASSWORD 'GANTI_PASSWORD_KUAT';
CREATE DATABASE tewiwi OWNER tewiwi_app;
SQL
```
`.env`: `DATABASE_URL=postgresql://tewiwi_app:PASSWORD@127.0.0.1:5432/tewiwi` dan `DATABASE_SSL=disable`. Jangan membuka port 5432 ke luar.

## 2. Siapkan server

```bash
# Node.js 20 atau lebih baru (contoh Node 22 via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx ufw
node -v

# Firewall: hanya SSH + web
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# User khusus agar aplikasi tidak berjalan sebagai root
sudo useradd --system --create-home --home-dir /opt/tewiwi-backend --shell /usr/sbin/nologin tewiwi
```

## 3. Pasang aplikasi

Upload isi folder ini (tanpa `node_modules`, `.env`) ke `/opt/tewiwi-backend`, lalu:

```bash
sudo chown -R tewiwi:tewiwi /opt/tewiwi-backend
cd /opt/tewiwi-backend
sudo -u tewiwi npm ci --omit=dev        # memerlukan package-lock.json (buat dengan `npm install` di komputer Anda, lalu commit)
sudo -u tewiwi cp .env.example .env
sudo -u tewiwi nano .env                # isi sesuai komentar di file; aktifkan baris produksi di bagian bawah
sudo chmod 600 .env
sudo -u tewiwi npm run migrate          # membuat tabel; harus mencetak "Migrasi dijalankan: 001_init.sql"
```

Nilai wajib produksi: `NODE_ENV=production`, `ADMIN_API_KEY` (acak, minimal 24 karakter), `CORS_ORIGIN`, `DATABASE_URL`, `TRUST_PROXY=1`.
Server **menolak berjalan** dengan pesan jelas jika ada yang kurang atau tidak aman.
Migrasi juga berjalan otomatis saat server start (`AUTO_MIGRATE=true`), dan aman walau dijalankan berulang.

## 4. Jalankan sebagai service (systemd)

`/etc/systemd/system/tewiwi.service`:

```ini
[Unit]
Description=Tewiwi backend
After=network.target

[Service]
User=tewiwi
WorkingDirectory=/opt/tewiwi-backend
EnvironmentFile=/opt/tewiwi-backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tewiwi
sudo systemctl status tewiwi                 # harus active (running)
curl http://127.0.0.1:3000/api/health         # {"status":"ok"} -> artinya aplikasi dan database terhubung
journalctl -u tewiwi -n 50 --no-pager         # log jika ada masalah
```

## 5. Nginx + HTTPS

`/etc/nginx/sites-available/tewiwi`:

```nginx
server {
    server_name api.contoh.com;
    client_max_body_size 200k;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tewiwi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.contoh.com   # pasang HTTPS + perpanjangan otomatis
```

Arahkan DNS A record `api.contoh.com` ke IP server sebelum menjalankan certbot.

## 6. Backup

- **RDS:** *automated backups* (langkah 1.5) memungkinkan restore ke titik waktu tertentu; ambil juga **snapshot manual** sebelum perubahan besar.
- **Salinan portabel dengan `pg_dump`** (versi klien harus sama atau lebih baru dari versi server: `sudo apt install postgresql-client-16`).
  `/opt/tewiwi-backend/backup.sh` (`chmod +x`, dimiliki user `tewiwi`):

  ```sh
  #!/bin/sh
  set -e
  cd /opt/tewiwi-backend
  set -a; . ./.env; set +a
  mkdir -p backups
  # Untuk RDS; hapus dua variabel PGSSL jika database lokal tanpa TLS
  PGSSLMODE=verify-full PGSSLROOTCERT=/opt/tewiwi-backend/certs/global-bundle.pem \
    pg_dump --format=custom --no-owner "$DATABASE_URL" -f "backups/tewiwi-$(date +%Y%m%d-%H%M%S).dump"
  find backups -name '*.dump' -mtime +14 -delete
  ```
  ```bash
  sudo -u tewiwi crontab -e
  # 0 2 * * * /opt/tewiwi-backend/backup.sh
  ```
  Salin folder `backups/` secara berkala ke tempat lain (mis. bucket S3), bukan hanya di server yang sama.
- **Restore** ke database kosong: `pg_restore --no-owner -d "$DATABASE_URL" backups/<file>.dump`
  (tambahkan `--clean --if-exists` untuk menimpa tabel yang sudah ada). Coba restore ke database uji sebelum Anda benar-benar membutuhkannya.

## 7. Cek setelah deploy

```bash
curl https://api.contoh.com/api/health                                  # 200
curl https://api.contoh.com/api/orders                                  # 401 (admin tanpa key)
curl -H "x-admin-key: <KEY_ANDA>" https://api.contoh.com/api/orders      # 200
curl -i https://api.contoh.com/api/slots | head -20                      # ada header strict-transport-security
```

Lalu atur frontend agar memanggil `https://api.contoh.com/api` dan pastikan alamat frontend sama persis dengan `CORS_ORIGIN`.
**Jangan menaruh admin key di kode frontend React** (siapa pun bisa membacanya). Pakai halaman admin yang meminta key dari pengguna, atau tambahkan login yang sesungguhnya.

## Alternatif: Docker (aplikasi saja; database tetap RDS atau PostgreSQL terpisah)

```bash
docker build -t tewiwi-backend .
docker run -d --name tewiwi --restart unless-stopped \
  --env-file .env -p 127.0.0.1:3000:3000 \
  -v /opt/tewiwi-backend/certs:/app/certs:ro \
  tewiwi-backend
```
Di `.env` untuk Docker: `DATABASE_SSL_CA=/app/certs/global-bundle.pem`. `HOST=0.0.0.0` sudah diatur oleh Dockerfile.
Nginx dan HTTPS (langkah 5) tetap sama. Build memerlukan `package-lock.json`.

## Mengubah skema database

Jangan mengedit `migrations/001_init.sql` setelah dipakai. Untuk perubahan, buat file baru berurutan, mis. `migrations/002_tambah_alamat.sql`,
lalu jalankan `npm run migrate` (atau cukup restart server). Setiap file dijalankan sekali dan dicatat di tabel `schema_migrations`.
Ambil snapshot/backup dulu sebelum migrasi di produksi.

## Batasan yang perlu diketahui

- Rate limit disimpan di memori satu proses. Jika menjalankan lebih dari satu instance aplikasi, pindahkan ke penyimpanan bersama (mis. Redis); kapasitas slot sendiri sudah aman untuk banyak instance karena dikunci di database.
- Satu admin key bersama untuk semua admin, tanpa login per pengguna. Cukup untuk toko kecil; jika timnya bertambah, pertimbangkan login (JWT).
- IP yang salah memasukkan admin key 10 kali diblokir 15 menit (termasuk admin sungguhan dari IP yang sama).
