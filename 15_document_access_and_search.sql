-- ============================================================
-- EPDH – Document access for everyone, admin-controlled restrictions,
--        and real AI search over document text
-- Run this in the Supabase SQL Editor AFTER 14_news_sources_sections.sql.
-- Safe to run more than once.
--
-- 1. Access: every signed-in user can read every document, whatever its
--    classification (PUBLIC, INTERNAL, LEGAL_PRIVILEGED are now labels).
--    An admin can mark a document "restricted"; then only admins, the
--    app's service roles and people the admin grants access to (in
--    document_user_access) can see it. Admins can update documents.
-- 2. Embeddings: switch to the free, open-source gte-small model
--    (384 numbers per chunk, half the space of the old 768). The old
--    vectors were all zeros (the embedding calls had been failing), so
--    they are cleared; the app re-embeds the chunk text.
--    The old ivfflat index is replaced by HNSW, which needs no training.
-- 3. Chunks are readable by whoever can read their document, so the AI
--    search runs as the person asking and respects restrictions.
-- 4. public.match_document_chunks(): hybrid search — meaning (vector)
--    plus keywords (full text), merged by reciprocal rank fusion.
--    SECURITY INVOKER: it only ever sees what the caller may read.
-- ============================================================

-- 1. Documents: readable by all signed-in users unless restricted
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS read_documents_public ON public.documents;
DROP POLICY IF EXISTS read_documents ON public.documents;
CREATE POLICY read_documents ON public.documents
    FOR SELECT TO authenticated
    USING (
        NOT restricted
        OR private.get_user_role() = ANY (ARRAY['power_admin', 'power_app', 'power_ai', 'power_ingestion'])
        OR EXISTS (
            SELECT 1 FROM public.document_user_access dua
            WHERE dua.document_id = documents.id
              AND dua.user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS update_documents_admin ON public.documents;
CREATE POLICY update_documents_admin ON public.documents
    FOR UPDATE TO authenticated
    USING (private.get_user_role() = 'power_admin')
    WITH CHECK (private.get_user_role() = 'power_admin');

CREATE INDEX IF NOT EXISTS idx_document_user_access_doc_user
    ON public.document_user_access (document_id, user_id);

-- 2. Embeddings: gte-small, 384 dimensions, HNSW index
DROP INDEX IF EXISTS public.embeddings_vector_idx;
DO $$
BEGIN
    IF (SELECT atttypmod FROM pg_attribute
        WHERE attrelid = 'public.embeddings'::regclass AND attname = 'embedding') <> 384 THEN
        ALTER TABLE public.embeddings ALTER COLUMN embedding TYPE extensions.vector(384) USING NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS embeddings_embedding_hnsw_idx
    ON public.embeddings USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_embeddings_document_id ON public.embeddings (document_id);

-- 3. Chunks are readable by whoever can read their document
REVOKE ALL ON public.embeddings FROM anon;
DROP POLICY IF EXISTS read_embeddings ON public.embeddings;
CREATE POLICY read_embeddings ON public.embeddings
    FOR SELECT TO authenticated
    USING (
        private.get_user_role() = ANY (ARRAY['power_admin', 'power_app', 'power_ai'])
        OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = embeddings.document_id)
    );

-- 4. Hybrid search, as the caller
CREATE OR REPLACE FUNCTION public.match_document_chunks(
    query_embedding extensions.vector(384),
    query_text text,
    match_count integer DEFAULT 8)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    chunk_index integer,
    chunk_text text,
    metadata jsonb,
    title text,
    document_type text,
    classification text,
    score double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH vec AS (
        SELECT e.id,
               row_number() OVER (ORDER BY e.embedding OPERATOR(extensions.<=>) query_embedding) AS rnk
        FROM public.embeddings e
        WHERE query_embedding IS NOT NULL AND e.embedding IS NOT NULL
        ORDER BY e.embedding OPERATOR(extensions.<=>) query_embedding
        LIMIT 40
    ),
    q AS (
        SELECT websearch_to_tsquery('english', coalesce(query_text, '')) AS tsq
    ),
    kw AS (
        SELECT e.id,
               row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('english', e.chunk_text), q.tsq) DESC) AS rnk
        FROM public.embeddings e, q
        WHERE coalesce(btrim(query_text), '') <> ''
          AND to_tsvector('english', e.chunk_text) @@ q.tsq
        ORDER BY ts_rank_cd(to_tsvector('english', e.chunk_text), q.tsq) DESC
        LIMIT 40
    ),
    fused AS (
        SELECT coalesce(v.id, k.id) AS id,
               coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) AS score
        FROM vec v
        FULL OUTER JOIN kw k ON k.id = v.id
    )
    SELECT e.id, e.document_id, e.chunk_index, e.chunk_text, e.metadata,
           d.title, d.document_type, d.classification, f.score::double precision
    FROM fused f
    JOIN public.embeddings e ON e.id = f.id
    JOIN public.documents d ON d.id = e.document_id
    ORDER BY f.score DESC
    LIMIT least(greatest(coalesce(match_count, 8), 1), 20);
$$;
REVOKE ALL ON FUNCTION public.match_document_chunks(extensions.vector, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, text, integer) TO authenticated, service_role;
