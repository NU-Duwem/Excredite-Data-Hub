-- ============================================================
-- EPDH – Per-person access to Regulatory & Advisory Matters
-- Run this in the Supabase SQL Editor after 19_temporary_passwords.sql.
-- Safe to run more than once.
--
-- Until now only roles decided who could use the work board:
--   * read jobs and tasks:          power_admin, power_ceo, power_legal, power_app
--   * create/edit jobs and tasks:   power_admin, power_legal, power_app
--
-- This adds a per-person grant (public.matter_access_grants). Someone with
-- a grant, whatever their role, can:
--   * see every job and task;
--   * create, edit, complete and delete tasks;
--   * be assigned tasks (they appear in the board's people list).
-- Creating and editing jobs stays with the roles above.
--
-- Admins give or remove grants in the Admin Panel (server-side, service role).
-- People can read only their own grant; admins can read all.
--
-- First grant: Taiwo Odugbemi (taiwo@excredite.ng), Research Analyst.
--
-- STATUS: prepared, NOT YET APPLIED to the live database (waiting for approval).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.matter_access_grants (
    user_id    uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.matter_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matter_access_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.matter_access_grants TO authenticated;
CREATE INDEX IF NOT EXISTS idx_matter_access_grants_granted_by ON public.matter_access_grants(granted_by);

DROP POLICY IF EXISTS "Read own or all as admin" ON public.matter_access_grants;
CREATE POLICY "Read own or all as admin" ON public.matter_access_grants
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR (SELECT private.get_user_role()) = 'power_admin');

COMMENT ON TABLE public.matter_access_grants IS
    'People given access to Regulatory & Advisory Matters beyond their role: view everything, work on tasks. Written by the server only.';

-- Does the signed-in person hold an active grant? (Used by RLS.)
CREATE OR REPLACE FUNCTION private.has_matter_grant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.matter_access_grants g
        JOIN public.user_profiles p ON p.id = g.user_id
        WHERE g.user_id = auth.uid() AND p.is_active
    );
$$;
REVOKE ALL ON FUNCTION private.has_matter_grant() FROM PUBLIC, anon;
-- Signed-in users need it because the RLS policies below call it.
GRANT EXECUTE ON FUNCTION private.has_matter_grant() TO authenticated;

-- Jobs: read with a grant too (writing jobs is unchanged)
DROP POLICY IF EXISTS read_matters ON public.matters;
CREATE POLICY read_matters ON public.matters
    FOR SELECT TO authenticated
    USING (
        (SELECT private.get_user_role()) = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_app'])
        OR (SELECT private.has_matter_grant())
    );

-- Tasks: read and write with a grant
DROP POLICY IF EXISTS read_matter_tasks ON public.matter_tasks;
CREATE POLICY read_matter_tasks ON public.matter_tasks
    FOR SELECT TO authenticated
    USING (
        (SELECT private.get_user_role()) = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_app'])
        OR (SELECT private.has_matter_grant())
    );

DROP POLICY IF EXISTS insert_matter_tasks ON public.matter_tasks;
CREATE POLICY insert_matter_tasks ON public.matter_tasks
    FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT private.get_user_role()) = ANY (ARRAY['power_admin', 'power_legal', 'power_app'])
        OR (SELECT private.has_matter_grant())
    );

DROP POLICY IF EXISTS update_matter_tasks ON public.matter_tasks;
CREATE POLICY update_matter_tasks ON public.matter_tasks
    FOR UPDATE TO authenticated
    USING (
        (SELECT private.get_user_role()) = ANY (ARRAY['power_admin', 'power_legal', 'power_app'])
        OR (SELECT private.has_matter_grant())
    )
    WITH CHECK (
        (SELECT private.get_user_role()) = ANY (ARRAY['power_admin', 'power_legal', 'power_app'])
        OR (SELECT private.has_matter_grant())
    );

DROP POLICY IF EXISTS delete_matter_tasks ON public.matter_tasks;
CREATE POLICY delete_matter_tasks ON public.matter_tasks
    FOR DELETE TO authenticated
    USING (
        (SELECT private.get_user_role()) = ANY (ARRAY['power_admin', 'power_legal', 'power_app'])
        OR (SELECT private.has_matter_grant())
    );

-- People on the board: also those with a grant; callers with a grant can list them.
CREATE OR REPLACE FUNCTION private.matter_people()
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
      AND (p.role IN ('power_admin', 'power_ceo', 'power_legal')
           OR EXISTS (SELECT 1 FROM public.matter_access_grants g WHERE g.user_id = p.id))
      AND (private.get_user_role() = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_app'])
           OR private.has_matter_grant())
    ORDER BY 2;
$$;
REVOKE ALL ON FUNCTION private.matter_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.matter_people() TO authenticated;

-- First grant: Taiwo
INSERT INTO public.matter_access_grants (user_id, granted_by)
SELECT t.id, d.id
FROM public.user_profiles t
LEFT JOIN public.user_profiles d ON d.email = 'duwem@excredite.ng'
WHERE t.email = 'taiwo@excredite.ng'
ON CONFLICT (user_id) DO NOTHING;
