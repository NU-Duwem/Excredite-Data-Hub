-- ============================================================
-- EPDH – Regulatory & Advisory work board: tasks on jobs
-- Run this in the Supabase SQL Editor AFTER 11_user_roles_lockdown.sql.
-- Safe to run more than once.
--
-- Adds:
--   1. public.matter_tasks – the tasks on each job (matter): title, notes,
--      status (To do / In progress / In review / Done), start and due
--      dates, and an assignee that is either one person or the whole team.
--   2. public.matters.lead_user_id – the job's lead as a real user (the
--      old free-text lead_counsel column is kept for existing records).
--   3. public.list_matter_people() – names and roles (never emails) of
--      the people who work on matters, so the board can show assignees.
--      user_profiles is otherwise readable only by admins and the owner.
--      The elevated lookup itself is private.matter_people().
--
-- Access (RLS, via private.get_user_role()):
--   * read jobs and tasks:   power_admin, power_ceo, power_legal, power_app
--   * create/edit jobs:      power_admin, power_legal, power_app
--                            (power_legal is new: the legal team runs the jobs)
--   * create/edit/delete tasks: power_admin, power_legal, power_app
-- ============================================================

-- 1. Job lead as a user
ALTER TABLE public.matters
    ADD COLUMN IF NOT EXISTS lead_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matters_lead_user_id ON public.matters(lead_user_id);

-- Legal team can create and edit jobs (reading is unchanged)
DROP POLICY IF EXISTS write_matters ON public.matters;
CREATE POLICY write_matters ON public.matters
    FOR INSERT TO authenticated
    WITH CHECK (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']));

DROP POLICY IF EXISTS update_matters ON public.matters;
CREATE POLICY update_matters ON public.matters
    FOR UPDATE TO authenticated
    USING (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']))
    WITH CHECK (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']));

-- 2. Tasks
CREATE TABLE IF NOT EXISTS public.matter_tasks (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_id        uuid NOT NULL REFERENCES public.matters(id) ON DELETE CASCADE,
    title            text NOT NULL,
    notes            text,
    status           text NOT NULL DEFAULT 'TODO',
    assignee_id      uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    assigned_to_team boolean NOT NULL DEFAULT false,
    start_date       date,
    due_date         date,
    position         integer NOT NULL DEFAULT 0,
    created_by       uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    completed_at     timestamptz,
    CONSTRAINT matter_tasks_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
    CONSTRAINT matter_tasks_notes_length CHECK (notes IS NULL OR char_length(notes) <= 4000),
    CONSTRAINT matter_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE')),
    CONSTRAINT matter_tasks_dates CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date),
    CONSTRAINT matter_tasks_one_assignee CHECK (NOT (assigned_to_team AND assignee_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_matter_tasks_matter_id   ON public.matter_tasks(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_assignee_id ON public.matter_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_created_by  ON public.matter_tasks(created_by);

-- Keep updated_at and completed_at right
CREATE OR REPLACE FUNCTION public.matter_tasks_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.status = 'DONE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'DONE') THEN
        NEW.completed_at := now();
    ELSIF NEW.status <> 'DONE' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.matter_tasks_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS matter_tasks_touch ON public.matter_tasks;
CREATE TRIGGER matter_tasks_touch
    BEFORE INSERT OR UPDATE ON public.matter_tasks
    FOR EACH ROW EXECUTE FUNCTION public.matter_tasks_touch();

ALTER TABLE public.matter_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matter_tasks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matter_tasks TO authenticated;

DROP POLICY IF EXISTS read_matter_tasks ON public.matter_tasks;
CREATE POLICY read_matter_tasks ON public.matter_tasks
    FOR SELECT TO authenticated
    USING (private.get_user_role() = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_app']));

DROP POLICY IF EXISTS insert_matter_tasks ON public.matter_tasks;
CREATE POLICY insert_matter_tasks ON public.matter_tasks
    FOR INSERT TO authenticated
    WITH CHECK (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']));

DROP POLICY IF EXISTS update_matter_tasks ON public.matter_tasks;
CREATE POLICY update_matter_tasks ON public.matter_tasks
    FOR UPDATE TO authenticated
    USING (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']))
    WITH CHECK (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']));

DROP POLICY IF EXISTS delete_matter_tasks ON public.matter_tasks;
CREATE POLICY delete_matter_tasks ON public.matter_tasks
    FOR DELETE TO authenticated
    USING (private.get_user_role() = ANY (ARRAY['power_admin', 'power_legal', 'power_app']));

-- 3. Who can be assigned work (names and roles only)
-- The lookup runs with elevated rights, so it lives in the private schema
-- (not exposed by the API), like private.get_user_role(). The public
-- function is a thin SECURITY INVOKER wrapper that the board calls.
CREATE OR REPLACE FUNCTION private.matter_people()
RETURNS TABLE (id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id,
           COALESCE(NULLIF(btrim(p.full_name), ''), 'Unnamed user')::text,
           p.role::text
    FROM public.user_profiles p
    WHERE p.is_active
      AND p.role IN ('power_admin', 'power_ceo', 'power_legal')
      AND private.get_user_role() = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_app'])
    ORDER BY 2;
$$;
-- Signed-in users on the board need this to see assignee names.
REVOKE ALL ON FUNCTION private.matter_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.matter_people() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_matter_people()
RETURNS TABLE (id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT * FROM private.matter_people();
$$;
REVOKE ALL ON FUNCTION public.list_matter_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_matter_people() TO authenticated;
