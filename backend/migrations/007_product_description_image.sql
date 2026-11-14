-- Deskripsi dan gambar produk. Produk lama diberi nilai kosong.
ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN image_url  TEXT NOT NULL DEFAULT '';
