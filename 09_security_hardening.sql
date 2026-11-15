-- ============================================================
-- EPDH – Security hardening (Supabase security advisor findings)
-- Run this in the Supabase SQL Editor AFTER 01–08. Safe to run more than once.
--
-- Fixes:
--   1. get_user_role() was callable by anyone through the REST API
--      (/rest/v1/rpc/get_user_role) and had no fixed search_path.
--      → moved to a "private" schema the API does not expose; signed-in
--        users keep EXECUTE because every RLS policy calls it.
--   2. handle_new_user() (signup trigger) and rls_auto_enable() (event
--      trigger) were callable through the API.
--      → EXECUTE revoked; triggers still fire (Postgres does not check
--        EXECUTE when a trigger fires). Fixed search_path on handle_new_user.
--   3. 16 partition tables had RLS on but no policies.
--      → each partition gets the same policies as its parent table.
--   4. pg_trgm was installed in the public schema.
--      → moved to the extensions schema (already on the default search_path).
--
-- IMPORTANT for future SQL: write new policies with
--     private.get_user_role()
-- not public.get_user_role() – the public one no longer exists.
-- Existing policies keep working: Postgres stores a reference to the
-- function itself, not its name.
--
-- Not fixable in SQL: "Leaked password protection" is a dashboard setting
-- (Authentication → Sign In / Providers → Email → "Prevent use of leaked passwords").
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_user_role() → private schema
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
BEGIN
    IF to_regprocedure('public.get_user_role()') IS NOT NULL THEN
        IF to_regprocedure('private.get_user_role()') IS NOT NULL THEN
            -- Both exist (e.g. 01 was re-run after this file): keep the private
            -- one, which the policies already point at, and drop the stray copy.
            DROP FUNCTION public.get_user_role();
        ELSE
            ALTER FUNCTION public.get_user_role() SET SCHEMA private;
        END IF;
    END IF;
END
$$;

ALTER FUNCTION private.get_user_role() SET search_path = '';
REVOKE ALL ON FUNCTION private.get_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_user_role() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Trigger functions: not callable through the API
-- ------------------------------------------------------------
ALTER FUNCTION public.handle_new_user() SET search_path = '';
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    -- Created by Supabase's "enable RLS on new tables" setting; may not exist everywhere.
    IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. Partition tables: same policies as their parents
--    (read: any signed-in user; insert: admin / app / ingestion roles)
-- ------------------------------------------------------------
DO $$
DECLARE
    part record;
    read_name text;
    write_name text;
BEGIN
    FOR part IN
        SELECT c.relname AS partition_name, p.relname AS parent_name
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND p.relname IN ('generation_output', 'gas_supply', 'transmission_data', 'distribution_performance')
    LOOP
        read_name := 'read_' || part.partition_name;
        write_name := 'write_' || part.partition_name;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part.partition_name);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', read_name, part.partition_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
            read_name, part.partition_name);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', write_name, part.partition_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.get_user_role() IN (''power_admin'', ''power_app'', ''power_ingestion''))',
            write_name, part.partition_name);
    END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 4. pg_trgm out of the public schema
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
    ) THEN
        ALTER EXTENSION pg_trgm SET SCHEMA extensions;
    END IF;
END
$$;
