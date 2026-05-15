-- ============================================================
-- EPDH - Supabase Backend Setup
-- Run this in the Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- ============================================================
-- 1. USER PROFILES TABLE (maps Supabase Auth users to EPDH roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    role text NOT NULL DEFAULT 'power_team',
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT check_user_role CHECK (role IN (
        'power_admin', 'power_ceo', 'power_app',
        'power_analyst', 'power_ingestion', 'power_team',
        'power_ai', 'power_legal'
    ))
);

ALTER TABLE public.user_profiles OWNER TO postgres;

-- ============================================================
-- 2. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'power_team')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fires after every new Supabase Auth signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. ROLE HELPER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- 4. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gas_supply ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transmission_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariff_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariff_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- ----- user_profiles -----
CREATE POLICY "Users can read own profile"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Admins can read all profiles"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (public.get_user_role() = 'power_admin');

CREATE POLICY "Users can update own profile (not role)"
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ----- Reference tables: states, organisations, power_plants -----
-- All authenticated users can read; only write-roles can modify

CREATE POLICY "read_states" ON public.states
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_states" ON public.states
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));
CREATE POLICY "update_states" ON public.states
    FOR UPDATE TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

CREATE POLICY "read_organisations" ON public.organisations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_organisations" ON public.organisations
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));
CREATE POLICY "update_organisations" ON public.organisations
    FOR UPDATE TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

CREATE POLICY "read_power_plants" ON public.power_plants
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_power_plants" ON public.power_plants
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));
CREATE POLICY "update_power_plants" ON public.power_plants
    FOR UPDATE TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

-- ----- Time-series tables: generation, gas, transmission, distribution -----

CREATE POLICY "read_generation" ON public.generation_output
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_generation" ON public.generation_output
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

CREATE POLICY "read_gas" ON public.gas_supply
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_gas" ON public.gas_supply
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

CREATE POLICY "read_transmission" ON public.transmission_data
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_transmission" ON public.transmission_data
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

CREATE POLICY "read_distribution" ON public.distribution_performance
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_distribution" ON public.distribution_performance
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

-- ----- Tariff tables -----

CREATE POLICY "read_tariff_orders" ON public.tariff_orders
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_tariff_orders" ON public.tariff_orders
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

CREATE POLICY "read_tariff_bands" ON public.tariff_bands
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_tariff_bands" ON public.tariff_bands
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

-- ----- Regulatory actions -----

CREATE POLICY "read_regulatory" ON public.regulatory_actions
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_regulatory" ON public.regulatory_actions
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

-- ----- Matters (LEGAL - restricted read) -----

CREATE POLICY "read_matters" ON public.matters
    FOR SELECT TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_ceo', 'power_legal', 'power_app'));
CREATE POLICY "write_matters" ON public.matters
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app'));
CREATE POLICY "update_matters" ON public.matters
    FOR UPDATE TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_app'));

-- ----- Documents (classification-based access) -----

CREATE POLICY "read_documents_public" ON public.documents
    FOR SELECT TO authenticated
    USING (
        classification IN ('PUBLIC', 'INTERNAL')
        OR public.get_user_role() IN ('power_admin', 'power_ceo', 'power_legal')
    );
CREATE POLICY "write_documents" ON public.documents
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion'));

-- ----- Embeddings (AI access) -----

CREATE POLICY "read_embeddings" ON public.embeddings
    FOR SELECT TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_app', 'power_ai'));
CREATE POLICY "write_embeddings" ON public.embeddings
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ai'));

-- ----- AI artifact tables: conversation_log, anomaly_alerts, forecasts -----

CREATE POLICY "read_conversation_log" ON public.conversation_log
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_conversation_log" ON public.conversation_log
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ai'));

CREATE POLICY "read_anomaly_alerts" ON public.anomaly_alerts
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_anomaly_alerts" ON public.anomaly_alerts
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ai'));
CREATE POLICY "update_anomaly_alerts" ON public.anomaly_alerts
    FOR UPDATE TO authenticated
    USING (public.get_user_role() IN ('power_admin', 'power_app'));

CREATE POLICY "read_forecasts" ON public.forecasts
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_forecasts" ON public.forecasts
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() IN ('power_admin', 'power_app', 'power_ai'));

-- ============================================================
-- 6. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    ('ingestion-staging', 'ingestion-staging', false, 104857600, NULL),
    ('exports', 'exports', false, 52428800, ARRAY['application/pdf', 'text/csv', 'application/json'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can read, write-roles can upload
CREATE POLICY "Authenticated users can download documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'documents');

CREATE POLICY "Write roles can upload documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND public.get_user_role() IN ('power_admin', 'power_app', 'power_ingestion')
    );

CREATE POLICY "Authenticated users can download exports"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'exports');

CREATE POLICY "App and AI can write exports"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'exports'
        AND public.get_user_role() IN ('power_admin', 'power_app', 'power_ai')
    );

CREATE POLICY "Ingestion can access staging"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'ingestion-staging'
        AND public.get_user_role() IN ('power_admin', 'power_ingestion')
    );

CREATE POLICY "Ingestion can upload staging"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'ingestion-staging'
        AND public.get_user_role() IN ('power_admin', 'power_ingestion')
    );

-- ============================================================
-- DONE - Backend setup complete
-- ============================================================
