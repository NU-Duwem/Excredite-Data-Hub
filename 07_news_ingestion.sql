-- ============================================================
-- EPDH – News ingestion (RSS)
-- Run this in the Supabase SQL Editor AFTER 03_epdh_updates.sql
--
-- Adds:
--   1. news_sources       – the list of RSS/Atom feeds to pull from
--   2. news_articles cols  – source link, region, guid, fetched_at
--   3. unique url          – so the same article is never stored twice
--   4. RLS for news_sources
--   5. Seed feeds (local + foreign), verified reachable on 2026-11-15
--   6. OPTIONAL hourly schedule via pg_cron + pg_net
-- ============================================================

-- ============================================================
-- 1. NEWS SOURCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.news_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    feed_url text NOT NULL UNIQUE,
    region text NOT NULL,
    -- true  = general news feed: keep only items that match electricity keywords
    -- false = energy-specific feed: keep every item
    filter_by_keywords boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_fetched_at timestamptz,
    last_status text,
    last_error text,
    last_item_count integer,          -- new articles saved on the last run
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT check_news_source_region CHECK (region IN ('LOCAL', 'FOREIGN')),
    CONSTRAINT check_news_source_status CHECK (last_status IS NULL OR last_status IN ('OK', 'ERROR'))
);

ALTER TABLE public.news_sources OWNER TO postgres;

-- ============================================================
-- 2. NEWS ARTICLES – extra columns
-- ============================================================
ALTER TABLE public.news_articles
    ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.news_sources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS region text,
    ADD COLUMN IF NOT EXISTS guid text,
    ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

ALTER TABLE public.news_articles DROP CONSTRAINT IF EXISTS check_news_article_region;
ALTER TABLE public.news_articles
    ADD CONSTRAINT check_news_article_region CHECK (region IS NULL OR region IN ('LOCAL', 'FOREIGN'));

-- ============================================================
-- 3. UNIQUE URL (de-duplication key for the ingester's upsert)
-- If this fails with "could not create unique index", duplicates
-- already exist. Find them with:
--   SELECT url, count(*) FROM public.news_articles
--   WHERE url IS NOT NULL GROUP BY url HAVING count(*) > 1;
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS news_articles_url_key ON public.news_articles (url);
CREATE INDEX IF NOT EXISTS news_articles_published_at_idx ON public.news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS news_articles_region_idx ON public.news_articles (region);

-- ============================================================
-- 4. RLS – everyone signed in can read sources; only admins edit them.
-- The ingester uses the service-role key and bypasses RLS.
-- ============================================================
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated can read news sources" ON public.news_sources;
CREATE POLICY "All authenticated can read news sources"
    ON public.news_sources FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins manage news sources" ON public.news_sources;
CREATE POLICY "Admins manage news sources"
    ON public.news_sources FOR ALL TO authenticated
    USING (public.get_user_role() = 'power_admin')
    WITH CHECK (public.get_user_role() = 'power_admin');

-- ============================================================
-- 5. SEED FEEDS
-- Inactive rows were blocked (HTTP 403 or connection error) from a
-- cloud server when tested; they may work from Vercel. Switch
-- is_active on to try them – failures show in last_error.
-- ============================================================
INSERT INTO public.news_sources (name, feed_url, region, filter_by_keywords, is_active, notes) VALUES
    -- Local: electricity/energy-specific (keep everything)
    ('Nigeria Electricity Hub', 'https://www.nigeriaelectricityhub.com/feed/', 'LOCAL', false, true, NULL),
    ('Energy Mix Report',       'https://energymixreport.com/feed/',          'LOCAL', false, false, 'Connection error from cloud server during testing'),
    -- Local: general news (keyword-filtered)
    ('Punch',                   'https://punchng.com/feed/',                    'LOCAL', true, true, NULL),
    ('BusinessDay',             'https://businessday.ng/feed/',                 'LOCAL', true, true, NULL),
    ('Premium Times',           'https://www.premiumtimesng.com/feed',          'LOCAL', true, true, NULL),
    ('Nairametrics',            'https://nairametrics.com/feed/',               'LOCAL', true, true, NULL),
    ('Vanguard',                'https://www.vanguardngr.com/feed/',            'LOCAL', true, true, NULL),
    ('ThisDay',                 'https://www.thisdaylive.com/index.php/feed/',  'LOCAL', true, true, NULL),
    ('Daily Trust',             'https://dailytrust.com/feed/',                 'LOCAL', true, true, NULL),
    ('Channels TV',             'https://www.channelstv.com/feed/',             'LOCAL', true, true, NULL),
    ('The Guardian Nigeria',    'https://guardian.ng/feed/',                    'LOCAL', true, false, '403 from cloud IP during testing'),
    ('The Nation',              'https://thenationonlineng.net/feed/',          'LOCAL', true, false, '403 from cloud IP during testing'),
    -- Foreign: power-sector trade press (keep everything)
    ('Utility Dive',            'https://www.utilitydive.com/feeds/news/',      'FOREIGN', false, true, NULL),
    ('Power Engineering',       'https://www.power-eng.com/feed/',              'FOREIGN', false, true, NULL),
    ('Renewable Energy World',  'https://www.renewableenergyworld.com/feed/',   'FOREIGN', false, true, NULL),
    ('ESI Africa',              'https://www.esi-africa.com/feed/',             'FOREIGN', false, false, '403 from cloud IP during testing'),
    -- Foreign: broader energy/climate (keyword-filtered)
    ('pv magazine',             'https://www.pv-magazine.com/feed/',            'FOREIGN', true, true, NULL),
    ('Energy-Storage.news',     'https://www.energy-storage.news/feed/',        'FOREIGN', true, true, NULL),
    ('Carbon Brief',            'https://www.carbonbrief.org/feed/',            'FOREIGN', true, true, NULL),
    ('OilPrice.com',            'https://oilprice.com/rss/main',                'FOREIGN', true, true, NULL),
    ('Energy Voice',            'https://www.energyvoice.com/feed/',            'FOREIGN', true, false, '403 from cloud IP during testing')
ON CONFLICT (feed_url) DO NOTHING;

-- ============================================================
-- 6. OPTIONAL: run the ingester every hour from the database.
-- Vercel's Hobby plan only allows a daily cron, so use this for
-- hourly updates. Requires the pg_cron and pg_net extensions
-- (Dashboard → Database → Extensions). Replace both placeholders,
-- then run this block on its own.
--
-- SELECT cron.schedule(
--   'epdh-ingest-news-hourly',
--   '7 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://<your-app-domain>/api/news/ingest',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
--     timeout_milliseconds := 55000
--   );
--   $$
-- );
--
-- To stop it:  SELECT cron.unschedule('epdh-ingest-news-hourly');
-- ============================================================
