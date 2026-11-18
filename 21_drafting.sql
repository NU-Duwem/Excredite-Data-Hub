-- ============================================================
-- EPDH – Drafting Desk: saved drafts and reusable workflows
-- Run this in the Supabase SQL Editor after 20_matter_access.sql.
-- Safe to run more than once.
--
--   1. public.drafting_sessions: each person's drafts, autosaved as they work
--      through the four checkpoints (brief, evidence, outline, draft).
--      Private: only the owner can see or change them.
--   2. public.drafting_workflows: a finished run saved for reuse (document
--      type, reader, request wording, evidence questions, outline, precedent).
--      Shared with the whole team unless the owner marks it private; only the
--      owner or an admin can change or delete it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.drafting_sessions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    title        text NOT NULL DEFAULT 'Untitled draft' CHECK (char_length(title) <= 300),
    checkpoint   smallint NOT NULL DEFAULT 1 CHECK (checkpoint BETWEEN 1 AND 4),
    state        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(state::text) <= 2000000),
    job_id       uuid REFERENCES public.matters(id) ON DELETE SET NULL,
    document_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drafting_sessions_owner ON public.drafting_sessions (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafting_sessions_job ON public.drafting_sessions (job_id);
CREATE INDEX IF NOT EXISTS idx_drafting_sessions_document ON public.drafting_sessions (document_id);

ALTER TABLE public.drafting_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drafting_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drafting_sessions TO authenticated;

DROP POLICY IF EXISTS "Owners manage their drafts" ON public.drafting_sessions;
CREATE POLICY "Owners manage their drafts" ON public.drafting_sessions
    FOR ALL TO authenticated
    USING (owner_id = (SELECT auth.uid()))
    WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.drafting_workflows (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    description   text CHECK (description IS NULL OR char_length(description) <= 500),
    doc_type      text NOT NULL,
    reader        text NOT NULL,
    request       text NOT NULL CHECK (char_length(request) <= 4000),
    questions     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
    outline       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(outline) = 'array'),
    precedent_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    shared        boolean NOT NULL DEFAULT true,
    created_by    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drafting_workflows_created_by ON public.drafting_workflows (created_by);
CREATE INDEX IF NOT EXISTS idx_drafting_workflows_precedent ON public.drafting_workflows (precedent_id);

ALTER TABLE public.drafting_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drafting_workflows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drafting_workflows TO authenticated;

DROP POLICY IF EXISTS "Read shared or own workflows" ON public.drafting_workflows;
CREATE POLICY "Read shared or own workflows" ON public.drafting_workflows
    FOR SELECT TO authenticated
    USING (shared OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Create own workflows" ON public.drafting_workflows;
CREATE POLICY "Create own workflows" ON public.drafting_workflows
    FOR INSERT TO authenticated
    WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners and admins change workflows" ON public.drafting_workflows;
CREATE POLICY "Owners and admins change workflows" ON public.drafting_workflows
    FOR UPDATE TO authenticated
    USING (created_by = (SELECT auth.uid()) OR (SELECT private.get_user_role()) = 'power_admin')
    WITH CHECK (created_by = (SELECT auth.uid()) OR (SELECT private.get_user_role()) = 'power_admin');

DROP POLICY IF EXISTS "Owners and admins delete workflows" ON public.drafting_workflows;
CREATE POLICY "Owners and admins delete workflows" ON public.drafting_workflows
    FOR DELETE TO authenticated
    USING (created_by = (SELECT auth.uid()) OR (SELECT private.get_user_role()) = 'power_admin');
