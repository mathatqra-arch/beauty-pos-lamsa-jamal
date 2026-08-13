-- ============================================================
-- لمسة جمال — Beauty POS — Supabase Full Wipe (RESET TO ZERO)
-- ============================================================
-- PURPOSE: completely reset your Supabase project so the new
--          db/supabase-schema.sql + db/rls-policies.sql +
--          db/rpc-functions.sql can run on a clean slate.
--
-- WHAT THIS DOES:
--   • Drops the ENTIRE public schema (all tables, views, functions,
--     triggers, sequences, policies, types) — CASCADE
--   • Recreates an empty public schema with proper grants
--   • Leaves auth.*, storage.*, and Supabase-managed extensions intact
--
-- ⚠️  WARNING: this DESTROYS ALL DATA in the public schema.
--    There is NO undo. Export your data first if you need it.
--
-- USAGE (Supabase Dashboard → SQL Editor → New query):
--   1. Paste this file → Run
--   2. Paste db/supabase-schema.sql → Run
--   3. Paste db/rls-policies.sql → Run
--   4. Paste db/rpc-functions.sql → Run
--   5. Re-seed by running prisma/seed.ts locally (offline mode),
--      OR run the cloud seed endpoint /api/setup (if implemented).
-- ============================================================

-- ============================================================
-- 1. DROP EVERYTHING (nuclear option — clean slate)
-- ============================================================
DROP SCHEMA IF EXISTS public CASCADE;

-- ============================================================
-- 2. RECREATE THE public SCHEMA WITH PROPER GRANTS
-- ============================================================
CREATE SCHEMA public;

-- Supabase standard grants — match the default project setup
GRANT USAGE  ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL    ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Default privileges for tables created by postgres (so RLS + roles work)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

-- ============================================================
-- 3. RESTORE CORE EXTENSIONS (safe — idempotent)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid helpers (optional)

-- ============================================================
-- 4. VERIFY — should show an empty schema (only extensions listed)
-- ============================================================
-- SELECT extname FROM pg_extension WHERE extnamespace = 'public'::regnamespace;

-- ============================================================
-- DONE. The public schema is now EMPTY and clean.
-- Run the three files in order:
--   1. db/supabase-schema.sql   (tables + indexes + triggers + RLS enable)
--   2. db/rls-policies.sql       (role-based RLS policies)
--   3. db/rpc-functions.sql      (atomic sale/purchase/return RPCs)
-- ============================================================
