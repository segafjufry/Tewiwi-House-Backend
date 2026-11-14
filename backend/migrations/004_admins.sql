-- Tabel admin untuk autentikasi berbasis username + password (hash bcrypt).
CREATE TABLE admins (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username     TEXT    NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL,
  display_name TEXT    NOT NULL DEFAULT '',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login   TIMESTAMPTZ
);
