-- ============================================================
-- EPDH – Topic tags on news articles
-- Run this in the Supabase SQL Editor AFTER 09_security_hardening.sql.
-- Safe to run more than once.
--
-- The ingester (frontend/utils/news/topics.ts) tags each article with one
-- or more of: regulation, grid, generation, distribution, renewables,
-- other. The News page filters on them with an array-overlap (&&) query,
-- which the GIN index serves.
-- ============================================================

ALTER TABLE public.news_articles
    ADD COLUMN IF NOT EXISTS topics text[] DEFAULT '{}'::text[] NOT NULL;

ALTER TABLE public.news_articles DROP CONSTRAINT IF EXISTS check_news_article_topics;
ALTER TABLE public.news_articles
    ADD CONSTRAINT check_news_article_topics CHECK (
        topics <@ ARRAY['regulation', 'grid', 'generation', 'distribution', 'renewables', 'other']::text[]
    );

CREATE INDEX IF NOT EXISTS news_articles_topics_idx ON public.news_articles USING gin (topics);
