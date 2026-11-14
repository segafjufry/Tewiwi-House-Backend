-- Alamat pengiriman pada order. Order lama (sebelum migrasi ini) diberi nilai kosong.
ALTER TABLE orders ADD COLUMN delivery_address TEXT NOT NULL DEFAULT '';
