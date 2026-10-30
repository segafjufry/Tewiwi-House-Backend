-- Aktifkan RLS pada tabel admins.
-- Tabel ini hanya diakses oleh backend lewat service role (koneksi langsung),
-- bukan lewat PostgREST/Supabase client, sehingga tidak perlu policy tambahan.
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
