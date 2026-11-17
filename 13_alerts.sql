-- ============================================================
-- EPDH – Alerts (formerly Anomaly Alerts): every kind of alert
-- Run this in the Supabase SQL Editor AFTER 12_matter_tasks.sql.
-- Safe to run more than once.
--
-- public.anomaly_alerts used to describe only power-plant output
-- anomalies. It now holds every kind of alert the Alerts tab shows:
--   LEGAL_COMPLIANCE       someone acting contrary to the law
--   URGENT_DEVELOPMENT     new orders, emergencies
--   DOCUMENT_CONTRADICTION documents in the system that disagree
--   GRID_DATA              plant output anomalies (the original kind)
--   SYSTEM                 the system's own checks, e.g. failing news feeds
--
-- Adds: category, severity, title, evidence (JSON list), affects,
-- suggested_action, dismiss_reason, reported_by, resolved_at, updated_at,
-- dedupe_key. Plant-only columns become optional for other kinds.
--
-- Access (RLS, via private.get_user_role()):
--   * read: every signed-in user (unchanged)
--   * report: every signed-in user may file a MANUAL alert as themselves
--   * triage (assign, investigate, resolve, dismiss, edit):
--       power_admin, power_ceo, power_legal, power_analyst, power_app,
--       and whoever the alert is assigned to
--   * automatic alerts: power_admin, power_app, power_ai (unchanged)
--
-- Also adds public.sync_system_alerts() (service role only), which the
-- news ingestion route calls after each pull: it opens an alert for each
-- active feed whose last pull failed, and resolves it once the feed works.
-- ============================================================

-- 1. New columns
ALTER TABLE public.anomaly_alerts
    ADD COLUMN IF NOT EXISTS category         text NOT NULL DEFAULT 'GRID_DATA',
    ADD COLUMN IF NOT EXISTS severity         text NOT NULL DEFAULT 'MEDIUM',
    ADD COLUMN IF NOT EXISTS title            text,
    ADD COLUMN IF NOT EXISTS evidence         jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS affects          text,
    ADD COLUMN IF NOT EXISTS suggested_action text,
    ADD COLUMN IF NOT EXISTS dismiss_reason   text,
    ADD COLUMN IF NOT EXISTS reported_by      uuid DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS resolved_at      timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS dedupe_key       text;

-- Plant-only fields are optional for other kinds of alert
ALTER TABLE public.anomaly_alerts ALTER COLUMN deviation_stddev DROP NOT NULL;
ALTER TABLE public.anomaly_alerts ALTER COLUMN alert_date SET DEFAULT CURRENT_DATE;

-- 2. Allowed values
ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_deviation;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_deviation
    CHECK (deviation_stddev IS NULL OR deviation_stddev > 0);

ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_alert_type;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_alert_type CHECK (alert_type IN (
    'HIGH_OUTPUT', 'LOW_OUTPUT', 'ZERO_OUTPUT', 'CURTAILMENT_SPIKE',
    'DOCUMENT_DISCREPANCY', 'LEGAL_MATTER_CONFLICT', 'NEWS_CONFLICT',
    'LEGAL_BREACH', 'URGENT_DEVELOPMENT', 'SYSTEM_CHECK', 'OTHER'));

ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_source_type;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_source_type CHECK (source_type IN (
    'GENERATION', 'DOCUMENT', 'LEGAL_MATTER', 'NEWS', 'MANUAL', 'SYSTEM'));

ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_alert_category;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_alert_category CHECK (category IN (
    'LEGAL_COMPLIANCE', 'URGENT_DEVELOPMENT', 'DOCUMENT_CONTRADICTION', 'GRID_DATA', 'SYSTEM'));

ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_alert_severity;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_alert_severity CHECK (severity IN (
    'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'));

ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_alert_text_lengths;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_alert_text_lengths CHECK (
    (title IS NULL OR char_length(title) <= 300)
    AND (explanation IS NULL OR char_length(explanation) <= 8000)
    AND (affects IS NULL OR char_length(affects) <= 300)
    AND (suggested_action IS NULL OR char_length(suggested_action) <= 2000)
    AND (dismiss_reason IS NULL OR char_length(dismiss_reason) <= 2000)
    AND jsonb_typeof(evidence) = 'array'
    AND pg_column_size(evidence) <= 65536);

-- Older rows: give existing kinds a matching category
UPDATE public.anomaly_alerts SET category = CASE
        WHEN alert_type IN ('DOCUMENT_DISCREPANCY') THEN 'DOCUMENT_CONTRADICTION'
        WHEN alert_type IN ('LEGAL_MATTER_CONFLICT', 'LEGAL_BREACH') THEN 'LEGAL_COMPLIANCE'
        WHEN alert_type IN ('NEWS_CONFLICT', 'URGENT_DEVELOPMENT') THEN 'URGENT_DEVELOPMENT'
        WHEN alert_type = 'SYSTEM_CHECK' THEN 'SYSTEM'
        ELSE 'GRID_DATA' END
    WHERE category = 'GRID_DATA' AND alert_type NOT IN ('HIGH_OUTPUT', 'LOW_OUTPUT', 'ZERO_OUTPUT', 'CURTAILMENT_SPIKE');

-- One open alert per automatic check (e.g. one per failing news feed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_anomaly_alerts_open_dedupe
    ON public.anomaly_alerts (dedupe_key)
    WHERE dedupe_key IS NOT NULL AND status IN ('UNREVIEWED', 'ASSIGNED');

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_status      ON public.anomaly_alerts (status);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_assigned_to ON public.anomaly_alerts (assigned_to);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_reported_by ON public.anomaly_alerts (reported_by);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_plant_id    ON public.anomaly_alerts (plant_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_document_id ON public.anomaly_alerts (document_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_matter_id   ON public.anomaly_alerts (matter_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_news_id     ON public.anomaly_alerts (news_id);

-- 3. Keep updated_at, reviewed_at and resolved_at right
CREATE OR REPLACE FUNCTION public.anomaly_alerts_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status IN ('RESOLVED', 'REVIEWED') THEN
            NEW.resolved_at := COALESCE(NEW.resolved_at, now());
        ELSIF NEW.status IN ('UNREVIEWED', 'ASSIGNED') THEN
            NEW.resolved_at := NULL;
            NEW.dismiss_reason := NULL;
        END IF;
        IF NEW.status <> 'UNREVIEWED' THEN
            NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.anomaly_alerts_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS anomaly_alerts_touch ON public.anomaly_alerts;
CREATE TRIGGER anomaly_alerts_touch
    BEFORE INSERT OR UPDATE ON public.anomaly_alerts
    FOR EACH ROW EXECUTE FUNCTION public.anomaly_alerts_touch();

-- 4. Access
-- Anyone signed in can report an alert by hand, as themselves, unassigned
DROP POLICY IF EXISTS report_anomaly_alerts ON public.anomaly_alerts;
CREATE POLICY report_anomaly_alerts ON public.anomaly_alerts
    FOR INSERT TO authenticated
    WITH CHECK (
        source_type = 'MANUAL'
        AND reported_by = auth.uid()
        AND status = 'UNREVIEWED'
        AND assigned_to IS NULL
        AND dedupe_key IS NULL
    );

-- Triage: the roles that act on alerts, plus the current assignee
DROP POLICY IF EXISTS update_anomaly_alerts ON public.anomaly_alerts;
DROP POLICY IF EXISTS update_anomaly_alerts_assigned ON public.anomaly_alerts;
CREATE POLICY update_anomaly_alerts ON public.anomaly_alerts
    FOR UPDATE TO authenticated
    USING (
        private.get_user_role() = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_analyst', 'power_app'])
        OR assigned_to = auth.uid()
    )
    WITH CHECK (
        private.get_user_role() = ANY (ARRAY['power_admin', 'power_ceo', 'power_legal', 'power_analyst', 'power_app'])
        OR assigned_to = auth.uid()
    );

-- 5. System checks: failing news feeds (called by the ingestion route)
CREATE OR REPLACE FUNCTION public.sync_system_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    opened integer;
BEGIN
    -- Open one alert per active feed whose last pull failed
    INSERT INTO public.anomaly_alerts
        (alert_date, alert_type, source_type, category, severity, title, explanation,
         affects, suggested_action, evidence, dedupe_key, reported_by)
    SELECT CURRENT_DATE, 'SYSTEM_CHECK', 'SYSTEM', 'SYSTEM', 'MEDIUM',
           left('News feed failing: ' || s.name, 300),
           'The last pull from this feed failed, so its stories are missing from News & Updates until it works again.',
           left(s.name, 300),
           'Check the feed address in news_sources. If the site has moved its feed, update the address; if it has closed, set is_active to false.',
           jsonb_build_array(jsonb_build_object(
               'label', s.name,
               'url', s.feed_url,
               'excerpt', left(COALESCE(s.last_error, 'No error message recorded.'), 500),
               'when', s.last_fetched_at)),
           'news-source:' || s.id::text,
           NULL
    FROM public.news_sources s
    WHERE s.is_active
      AND s.last_status = 'ERROR'
      AND NOT EXISTS (
          SELECT 1 FROM public.anomaly_alerts a
          WHERE a.dedupe_key = 'news-source:' || s.id::text
            AND a.status IN ('UNREVIEWED', 'ASSIGNED'));
    GET DIAGNOSTICS opened = ROW_COUNT;

    -- Resolve alerts for feeds that work again, or were switched off
    UPDATE public.anomaly_alerts a
    SET status = 'RESOLVED',
        resolved_at = now(),
        suggested_action = 'Resolved automatically: the feed worked again or was switched off.'
    FROM public.news_sources s
    WHERE a.dedupe_key = 'news-source:' || s.id::text
      AND a.status IN ('UNREVIEWED', 'ASSIGNED')
      AND (s.last_status IS DISTINCT FROM 'ERROR' OR NOT s.is_active);

    RETURN opened;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_system_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_system_alerts() TO service_role;
