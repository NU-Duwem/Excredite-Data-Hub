-- ============================================================
-- EPDH Updates – Migration Script
-- Run this in the Supabase SQL Editor AFTER 01_supabase_backend_setup.sql
-- ============================================================

-- ============================================================
-- 1. SYSTEM SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES public.user_profiles(id)
);

ALTER TABLE public.system_settings OWNER TO postgres;

-- Seed defaults
INSERT INTO public.system_settings (key, value) VALUES
    ('anomaly_detection_threshold', '2.0'),
    ('anomaly_alerts_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. USER ACTIVITY LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    action text NOT NULL,
    details text,
    ip_address text,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.user_activity_log OWNER TO postgres;

-- ============================================================
-- 3. DOCUMENT USER ACCESS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_user_access (
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES public.user_profiles(id),
    granted_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (document_id, user_id)
);

ALTER TABLE public.document_user_access OWNER TO postgres;

-- ============================================================
-- 4. NEWS ARTICLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.news_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    source text NOT NULL,
    title text NOT NULL,
    url text,
    summary text,
    image_url text,
    published_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.news_articles OWNER TO postgres;

-- ============================================================
-- 5. UPDATE ANOMALY_ALERTS TABLE
-- ============================================================

-- Make plant_id nullable for non-generation alerts
ALTER TABLE public.anomaly_alerts ALTER COLUMN plant_id DROP NOT NULL;

-- Add columns for broader anomaly source tracking
ALTER TABLE public.anomaly_alerts ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id);
ALTER TABLE public.anomaly_alerts ADD COLUMN IF NOT EXISTS matter_id uuid REFERENCES public.matters(id);
ALTER TABLE public.anomaly_alerts ADD COLUMN IF NOT EXISTS news_id uuid REFERENCES public.news_articles(id);
ALTER TABLE public.anomaly_alerts ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.user_profiles(id);
ALTER TABLE public.anomaly_alerts ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'GENERATION' NOT NULL;

-- Drop old narrow constraint and replace with broader one
ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_alert_type;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_alert_type CHECK (
    alert_type IN (
        'HIGH_OUTPUT', 'LOW_OUTPUT', 'ZERO_OUTPUT', 'CURTAILMENT_SPIKE',
        'DOCUMENT_DISCREPANCY', 'LEGAL_MATTER_CONFLICT', 'NEWS_CONFLICT'
    )
);

-- Update status constraint to include assignment tracking
ALTER TABLE public.anomaly_alerts DROP CONSTRAINT IF EXISTS check_alert_status;
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_alert_status CHECK (
    status IN ('UNREVIEWED', 'ASSIGNED', 'REVIEWED', 'RESOLVED', 'DISMISSED')
);

-- Add source type constraint
ALTER TABLE public.anomaly_alerts ADD CONSTRAINT check_source_type CHECK (
    source_type IN ('GENERATION', 'DOCUMENT', 'LEGAL_MATTER', 'NEWS')
);

-- ============================================================
-- 6. UPDATE STORAGE BUCKET MIME TYPES
-- ============================================================
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
WHERE id = 'documents';

-- ============================================================
-- 7. ENABLE RLS ON NEW TABLES
-- ============================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. RLS POLICIES FOR NEW TABLES
-- ============================================================

-- ----- system_settings -----
CREATE POLICY "Anyone can read settings"
    ON public.system_settings FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Only admins can update settings"
    ON public.system_settings FOR UPDATE TO authenticated
    USING (public.get_user_role() = 'power_admin')
    WITH CHECK (public.get_user_role() = 'power_admin');

-- ----- user_activity_log -----
CREATE POLICY "Users can read own activity"
    ON public.user_activity_log FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins can read all activity"
    ON public.user_activity_log FOR SELECT TO authenticated
    USING (public.get_user_role() = 'power_admin');

CREATE POLICY "System can insert activity logs"
    ON public.user_activity_log FOR INSERT TO authenticated
    WITH CHECK (true);

-- ----- document_user_access -----
CREATE POLICY "Users can see own access grants"
    ON public.document_user_access FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all document access"
    ON public.document_user_access FOR ALL TO authenticated
    USING (public.get_user_role() = 'power_admin')
    WITH CHECK (public.get_user_role() = 'power_admin');

-- ----- news_articles -----
CREATE POLICY "All authenticated can read news"
    ON public.news_articles FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins and apps can write news"
    ON public.news_articles FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app'));

-- ============================================================
-- 9. UPDATE DOCUMENTS RLS – respect per-user access grants
-- ============================================================
DROP POLICY IF EXISTS "read_documents_public" ON public.documents;

CREATE POLICY "read_documents_public" ON public.documents
    FOR SELECT TO authenticated
    USING (
        classification IN ('PUBLIC', 'INTERNAL')
        OR public.get_user_role() IN ('power_admin', 'power_ceo', 'power_legal')
        OR EXISTS (
            SELECT 1 FROM public.document_user_access dua
            WHERE dua.document_id = id AND dua.user_id = auth.uid()
        )
    );

-- ============================================================
-- 10. UPDATE ANOMALY_ALERTS POLICIES – any user can be assigned
-- ============================================================
CREATE POLICY "update_anomaly_alerts_assigned"
    ON public.anomaly_alerts FOR UPDATE TO authenticated
    USING (assigned_to = auth.uid());

-- ============================================================
-- DONE – Migration complete
-- ============================================================
