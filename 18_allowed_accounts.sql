-- ============================================================
-- EPDH – Only listed staff emails can have an account
-- Run this in the Supabase SQL Editor after
-- 17_profile_pictures_and_company_accounts.sql. Safe to run more than once.
--
-- Before this, any @excredite.ng address was accepted. Now an account can
-- exist only for an address on public.allowed_accounts, and that list may
-- only hold @excredite.ng addresses. This covers every way in: "Sign in
-- with email" (Excredite's Microsoft 365), admin-created users and sign-up.
--
-- The list is readable and writable only by the server (service role):
-- signed-in users and the public API can't see or change it. The Admin
-- Panel's "Add user" puts the new address on the list first.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.allowed_accounts (
    email    text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@excredite\.ng$'),
    added_at timestamptz NOT NULL DEFAULT now(),
    note     text
);
ALTER TABLE public.allowed_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.allowed_accounts FROM PUBLIC, anon, authenticated;
-- Only the service role (which bypasses RLS) uses it; say so explicitly.
DROP POLICY IF EXISTS "No access through the API" ON public.allowed_accounts;
CREATE POLICY "No access through the API" ON public.allowed_accounts
    AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
COMMENT ON TABLE public.allowed_accounts IS 'Email addresses allowed to hold an EPDH account. Server-only.';

INSERT INTO public.allowed_accounts (email, note) VALUES
    ('duwem@excredite.ng',   'Duwem Nwapi'),
    ('eyo@excredite.ng',     'Eyo Ekpo'),
    ('osefan@excredite.ng',  'Osefan Anegbe'),
    ('phillip@excredite.ng', 'Phillip Ekpo'),
    ('taiwo@excredite.ng',   'Taiwo Odugbemi')
ON CONFLICT (email) DO NOTHING;

-- The account rule: company domain AND on the list
CREATE OR REPLACE FUNCTION private.require_company_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.email IS NULL
       OR lower(btrim(NEW.email)) !~ '^[^@\s]+@excredite\.ng$'
       OR NOT EXISTS (SELECT 1 FROM public.allowed_accounts a WHERE a.email = lower(btrim(NEW.email))) THEN
        RAISE EXCEPTION 'This email address does not have access to EPDH.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.require_company_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS require_company_email ON auth.users;
CREATE TRIGGER require_company_email
    BEFORE INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION private.require_company_email();
