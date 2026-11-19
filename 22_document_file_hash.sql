-- 22_document_file_hash.sql
-- Adds the documents.file_hash column (SHA-256 of the original file).
-- 06_document_embeddings_setup.sql was meant to add it, but the live database
-- never got it, so the bulk import tool couldn't check for duplicates.
-- Safe to run more than once.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_hash text;

CREATE INDEX IF NOT EXISTS documents_file_hash_idx
  ON public.documents (file_hash);

COMMENT ON COLUMN public.documents.file_hash IS
  'SHA-256 of the original file, used to skip duplicates on upload and import.';
