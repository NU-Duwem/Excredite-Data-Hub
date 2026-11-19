-- 23_failed_documents_admin_only.sql
-- Documents whose processing failed (processing_status = 'FAILED') are visible
-- to System Admins (power_admin) only. Everyone else no longer sees them in the
-- library, on the Overview, in search or in the Drafting Desk.
--
-- A RESTRICTIVE policy is ANDed with the existing permissive read_documents
-- policy, so restricted-document rules still apply on top. Passages follow
-- automatically: read_embeddings checks that the parent document is readable.
-- The server (service_role) is unaffected. Safe to run more than once.

DROP POLICY IF EXISTS failed_documents_admin_only ON public.documents;

CREATE POLICY failed_documents_admin_only
    ON public.documents
    AS RESTRICTIVE
    FOR SELECT
    TO authenticated
    USING (
        processing_status IS DISTINCT FROM 'FAILED'
        OR (SELECT private.get_user_role()) = 'power_admin'
    );
