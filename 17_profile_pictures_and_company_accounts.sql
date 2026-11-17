-- ============================================================
-- EPDH – Profile pictures; company accounts only
-- Run this in the Supabase SQL Editor after 16_staff_emails.sql.
-- Safe to run more than once.
--
--   1. Profile pictures:
--      * user_profiles.avatar_path holds the picture's place in storage.
--        It must sit in the person's own folder (<user id>/…).
--      * A private "avatars" bucket: JPEG, PNG or WebP, at most 2 MB.
--        The app shrinks pictures to 256×256 before uploading them.
--      * Every signed-in user can see pictures. People can upload,
--        replace or remove their own; admins can do this for anyone.
--      * The work board's people list (list_matter_people) now
--        includes each person's picture.
--   2. Company accounts only: a trigger on auth.users refuses any
--      account (new, or a changed address) that isn't @excredite.ng.
--      This covers email sign-up, admin-created users and
--      "Sign in with Microsoft".
-- ============================================================

-- 1a. Picture column. People can set their own (RLS already limits
--     updates to their own row); admins set others' through the server.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_avatar_in_own_folder;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_avatar_in_own_folder
    CHECK (avatar_path IS NULL OR (avatar_path LIKE id::text || '/%' AND length(avatar_path) <= 200));

GRANT UPDATE (avatar_path) ON public.user_profiles TO authenticated;

-- 1b. Private bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 1c. Storage rules
DROP POLICY IF EXISTS "Signed-in users can view profile pictures" ON storage.objects;
CREATE POLICY "Signed-in users can view profile pictures" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "People and admins can add profile pictures" ON storage.objects;
CREATE POLICY "People and admins can add profile pictures" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT private.get_user_role()) = 'power_admin')
    );

DROP POLICY IF EXISTS "People and admins can replace profile pictures" ON storage.objects;
CREATE POLICY "People and admins can replace profile pictures" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT private.get_user_role()) = 'power_admin')
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT private.get_user_role()) = 'power_admin')
    );

DROP POLICY IF EXISTS "People and admins can remove profile pictures" ON storage.objects;
CREATE POLICY "People and admins can remove profile pictures" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT private.get_user_role()) = 'power_admin')
    );

-- 1d. Work board people now include their picture (return type changes,
--     so both functions are dropped and recreated).
DROP FUNCTION IF EXISTS public.list_matter_people();
DROP FUNCTION IF EXISTS private.matter_people();

CREATE FUNCTION private.matter_people()
RETURNS TABLE (id uuid, full_name text, role text, avatar_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id,
           COALESCE(NULLIF(btrim(p.full_name), ''), 'Unnamed user')::text,
           p.role::text,
           p.avatar_path
    FROM public.user_profiles p
    WHERE p.is_active
      AND p.role IN ('power_admin', 'power_ceo', 'power_legal')
      AND private.get_user_role() = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_app'])
    ORDER BY 2;
$$;
-- Signed-in users on the board need this to see assignees.
REVOKE ALL ON FUNCTION private.matter_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.matter_people() TO authenticated;

CREATE FUNCTION public.list_matter_people()
RETURNS TABLE (id uuid, full_name text, role text, avatar_path text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT * FROM private.matter_people();
$$;
REVOKE ALL ON FUNCTION public.list_matter_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_matter_people() TO authenticated;

-- 2. Company accounts only
CREATE OR REPLACE FUNCTION private.require_company_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.email IS NULL OR lower(btrim(NEW.email)) !~ '^[^@\s]+@excredite\.ng$' THEN
        RAISE EXCEPTION 'Only @excredite.ng accounts can use EPDH.'
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
