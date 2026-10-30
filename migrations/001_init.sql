-- Skema awal Tewiwi (PostgreSQL). Dijalankan otomatis oleh `npm run migrate` / saat server start.

CREATE TABLE products (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT    NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  flour_grams INTEGER NOT NULL DEFAULT 0 CHECK (flour_grams >= 0), -- kebutuhan tepung per pcs
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Hari pengiriman rutin (0=Minggu ... 6=Sabtu) beserta kapasitas default per slot
CREATE TABLE delivery_days (
  weekday  SMALLINT PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  capacity INTEGER  NOT NULL CHECK (capacity >= 0),
  active   BOOLEAN  NOT NULL DEFAULT TRUE
);

-- Kapasitas khusus untuk satu tanggal (misal bulk order / libur)
CREATE TABLE slot_overrides (
  delivery_date DATE PRIMARY KEY,
  capacity      INTEGER NOT NULL CHECK (capacity >= 0)
);

CREATE TABLE orders (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Baru'
                CHECK (status IN ('Baru', 'Dikonfirmasi', 'Diproduksi', 'Dikirim', 'Dibatalkan')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_date ON orders (delivery_date);

CREATE TABLE order_items (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products (id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0) -- harga saat order dibuat
);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- Data historis (sintetis / import) untuk melatih model prediksi
CREATE TABLE order_history (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_date DATE    NOT NULL,
  product_id    INTEGER NOT NULL REFERENCES products (id),
  quantity      INTEGER NOT NULL CHECK (quantity >= 0)
);
CREATE INDEX idx_history_product ON order_history (product_id, delivery_date);
