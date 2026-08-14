-- ============================================================
-- EPDH – Document Processing & Vector Embeddings Schema Updates
-- ============================================================

-- 1. Enable pgvector extension for AI vector search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Add slide_count, summary, and file_hash columns to documents table
ALTER TABLE public.documents 
  ADD COLUMN IF NOT EXISTS slide_count integer,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS extracted_metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS documents_file_hash_idx 
  ON public.documents (file_hash);

-- 3. Enhance public.embeddings table with vector and metadata JSONB
ALTER TABLE public.embeddings 
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(768),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 4. Create vector cosine similarity index for fast RAG search
CREATE INDEX IF NOT EXISTS embeddings_vector_idx 
  ON public.embeddings USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- 5. Full-text search index on chunk text
CREATE INDEX IF NOT EXISTS embeddings_chunk_text_fts_idx 
  ON public.embeddings USING gin (to_tsvector('english', chunk_text));
