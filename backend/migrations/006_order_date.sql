-- Tanggal order dibuat (terpisah dari delivery_date / created_at timestamp).
-- Order lama diisi dari tanggal created_at, order baru otomatis pakai tanggal hari ini.
ALTER TABLE orders ADD COLUMN order_date DATE;
UPDATE orders SET order_date = created_at::date WHERE order_date IS NULL;
ALTER TABLE orders ALTER COLUMN order_date SET NOT NULL;
ALTER TABLE orders ALTER COLUMN order_date SET DEFAULT CURRENT_DATE;
