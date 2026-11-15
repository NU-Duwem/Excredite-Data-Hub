-- ============================================================
-- EPDH – Hourly news ingestion schedule (pg_cron + pg_net)
-- Run this in the Supabase SQL Editor AFTER 07_news_ingestion.sql.
-- Safe to run more than once.
--
-- How it works:
--   * Every hour at minute 7, pg_cron runs public.epdh_trigger_news_ingest().
--   * That function POSTs to <news_ingest_url>/api/news/ingest with
--     "Authorization: Bearer <secret>", the secret being read from Supabase
--     Vault at run time (it never appears in the cron job or in this file).
--   * While system_settings.news_ingest_url is empty (app not deployed yet)
--     the job does nothing.
--
-- After deploying the app:
--   1. Point the job at the app:
--        UPDATE public.system_settings SET value = 'https://<your-app-domain>'
--        WHERE key = 'news_ingest_url';
--   2. Copy the generated secret into the app's CRON_SECRET env var:
--        SELECT decrypted_secret FROM vault.decrypted_secrets
--        WHERE name = 'epdh_cron_secret';
--
-- Check it is running:
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'epdh-ingest-news-hourly')
--   ORDER BY start_time DESC LIMIT 10;
--   SELECT id, status_code, error_msg, created FROM net._http_response ORDER BY created DESC LIMIT 10;
--
-- Stop it:   SELECT cron.unschedule('epdh-ingest-news-hourly');
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Settings
--    news_ingest_url       – app base URL the job calls (empty = job idles)
--    news_ingest_last_run  – when a pull last started; drives the 5-minute
--                            cool-down on the "Refresh feeds" buttons
INSERT INTO public.system_settings (key, value) VALUES
    ('news_ingest_url', ''),
    ('news_ingest_last_run', '1970-01-01T00:00:00.000Z')
ON CONFLICT (key) DO NOTHING;

-- 3. Shared secret, generated inside the database and stored encrypted in Vault
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'epdh_cron_secret') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'epdh_cron_secret',
            'Bearer token for /api/news/ingest. Copy into the app''s CRON_SECRET env var.'
        );
    END IF;
END
$$;

-- 4. The function the schedule runs
CREATE OR REPLACE FUNCTION public.epdh_trigger_news_ingest()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    base_url text;
    secret text;
    request_id bigint;
BEGIN
    SELECT nullif(btrim(value), '') INTO base_url
    FROM public.system_settings WHERE key = 'news_ingest_url';

    IF base_url IS NULL THEN
        RETURN NULL; -- app not deployed yet: nothing to call
    END IF;
    IF base_url !~ '^https://' THEN
        RAISE WARNING 'news_ingest_url must start with https:// (got %)', base_url;
        RETURN NULL;
    END IF;

    SELECT decrypted_secret INTO secret
    FROM vault.decrypted_secrets WHERE name = 'epdh_cron_secret';
    IF secret IS NULL THEN
        RAISE WARNING 'Vault secret epdh_cron_secret is missing';
        RETURN NULL;
    END IF;

    SELECT net.http_post(
        url := rtrim(base_url, '/') || '/api/news/ingest',
        headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
    ) INTO request_id;

    RETURN request_id;
END
$$;

-- Only the scheduler (postgres) may run it; never exposed through the API.
REVOKE ALL ON FUNCTION public.epdh_trigger_news_ingest() FROM PUBLIC, anon, authenticated;

-- 5. Schedule: every hour at minute 7 (re-running updates the same job)
SELECT cron.schedule(
    'epdh-ingest-news-hourly',
    '7 * * * *',
    $cron$SELECT public.epdh_trigger_news_ingest();$cron$
);
