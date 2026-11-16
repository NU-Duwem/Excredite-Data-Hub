-- ============================================================
-- EPDH – Lock down user roles; real "sign out everywhere"
-- Run this in the Supabase SQL Editor AFTER 10_news_topics.sql.
-- Safe to run more than once.
--
-- Fixes (security):
--   1. The RLS policy "Users can update own profile (not role)" only
--      checked the row was the user's own, so any signed-in user could
--      UPDATE their own user_profiles.role to 'power_admin' (or set
--      is_active back to true). Signed-in users may now update only
--      full_name and updated_at; everything else goes through the
--      server (service role).
--   2. handle_new_user() copied the role from raw_user_meta_data, which
--      the person signing up controls (supabase.auth.signUp({ options:
--      { data: { role: 'power_admin' } } })). It now reads the role from
--      raw_app_meta_data, which only the service role can set, and
--      defaults to power_team.
--
-- Adds:
--   3. public.force_logout_user(uuid) – deletes a user's sessions and
--      refresh tokens. Callable only with the service role (the Admin
--      API route); not exposed to anon/authenticated.
-- ============================================================

-- 1. Column-level update rights on user_profiles
REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT UPDATE (full_name, updated_at) ON public.user_profiles TO authenticated;

-- 2. Signup trigger: role only from app_metadata (server-controlled)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NULLIF(NEW.raw_app_meta_data->>'role', ''), 'power_team')
    );
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. Sign a user out of every device
CREATE OR REPLACE FUNCTION public.force_logout_user(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    removed integer;
BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
    DELETE FROM auth.sessions WHERE user_id = target_user_id;
    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed; -- number of sessions ended
END;
$$;
REVOKE ALL ON FUNCTION public.force_logout_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_logout_user(uuid) TO service_role;
