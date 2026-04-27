-- Migration: add user role enum type and column
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('developer', 'architect');
    END IF;
END
$$;

ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'developer';

COMMIT;

-- Note: If your users table already has a "role" column with different values or case,
-- you may need to migrate existing values manually (e.g., UPDATE users SET role = lower(role) WHERE role IS NOT NULL)
-- or adjust this migration to suit your database state. Run carefully on production.
