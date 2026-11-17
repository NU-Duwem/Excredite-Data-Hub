-- ============================================================
-- EPDH – One-time temporary passwords for a person's first sign-in
-- Run this in the Supabase SQL Editor after 18_allowed_accounts.sql.
-- Safe to run more than once.
--
-- An admin issues a temporary password in the Admin Panel (when adding
-- someone, or later for an existing person). It:
--   * works for ONE sign-in only, then is spent;
--   * expires after 7 days by default (the Admin Panel uses 72 hours);
--   * locks after 5 wrong tries (the admin then issues a new one);
--   * works only for an active account on the allowed list.
-- Only a bcrypt hash is stored. Issuing a new one replaces the old one.
--
-- These are separate from Supabase's own passwords: the app checks them
-- through /api/auth/temporary-sign-in (server only), then starts the
-- session itself. The table and both functions are server-only: signed-in
-- users and the public API can't read, call or change them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.temporary_passwords (
    user_id         uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    password_hash   text NOT NULL,
    created_by      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    failed_attempts integer NOT NULL DEFAULT 0,
    used_at         timestamptz
);
ALTER TABLE public.temporary_passwords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.temporary_passwords FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "No access through the API" ON public.temporary_passwords;
CREATE POLICY "No access through the API" ON public.temporary_passwords
    AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_temporary_passwords_created_by ON public.temporary_passwords(created_by);
COMMENT ON TABLE public.temporary_passwords IS 'One-time first sign-in passwords (bcrypt hashes). Server-only.';

-- Issue (or replace) a person's temporary password. Returns when it expires.
CREATE OR REPLACE FUNCTION public.issue_temporary_password(
    p_user_id uuid, p_password text, p_created_by uuid, p_valid_hours integer DEFAULT 168
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_expires timestamptz := now() + make_interval(hours => LEAST(GREATEST(COALESCE(p_valid_hours, 168), 1), 720));
BEGIN
    IF p_password IS NULL OR length(p_password) < 10 THEN
        RAISE EXCEPTION 'A temporary password must be at least 10 characters.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = p_user_id) THEN
        RAISE EXCEPTION 'No such user.';
    END IF;
    INSERT INTO public.temporary_passwords (user_id, password_hash, created_by, created_at, expires_at, failed_attempts, used_at)
    VALUES (p_user_id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_created_by, now(), v_expires, 0, NULL)
    ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        created_by = EXCLUDED.created_by,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at,
        failed_attempts = 0,
        used_at = NULL;
    RETURN v_expires;
END;
$$;

-- Spend a temporary password. Returns the user's id if it was right, unused,
-- unexpired, not locked, and the account is active and allowed; else NULL.
-- A wrong guess counts towards the 5-try lock.
CREATE OR REPLACE FUNCTION public.redeem_temporary_password(p_email text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email text := lower(btrim(COALESCE(p_email, '')));
    v_row   public.temporary_passwords%ROWTYPE;
BEGIN
    SELECT t.* INTO v_row
    FROM public.temporary_passwords t
    JOIN auth.users u ON u.id = t.user_id
    JOIN public.user_profiles p ON p.id = t.user_id
    JOIN public.allowed_accounts a ON a.email = lower(u.email)
    WHERE lower(u.email) = v_email
      AND p.is_active
    FOR UPDATE OF t;

    IF NOT FOUND OR v_row.used_at IS NOT NULL OR v_row.expires_at < now() OR v_row.failed_attempts >= 5 THEN
        RETURN NULL;
    END IF;

    IF v_row.password_hash <> extensions.crypt(COALESCE(p_password, ''), v_row.password_hash) THEN
        UPDATE public.temporary_passwords SET failed_attempts = failed_attempts + 1 WHERE user_id = v_row.user_id;
        RETURN NULL;
    END IF;

    UPDATE public.temporary_passwords SET used_at = now() WHERE user_id = v_row.user_id;
    RETURN v_row.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.issue_temporary_password(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_temporary_password(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_temporary_password(uuid, text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_temporary_password(text, text) TO service_role;
