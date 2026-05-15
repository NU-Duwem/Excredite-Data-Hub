--
-- PostgreSQL database dump
--

-- ============================================================
-- Clean slate: drop existing objects so the script is re-runnable
-- (CASCADE handles partitions, foreign keys, and dependents)
-- ============================================================
DROP TABLE IF EXISTS public.embeddings CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.anomaly_alerts CASCADE;
DROP TABLE IF EXISTS public.forecasts CASCADE;
DROP TABLE IF EXISTS public.conversation_log CASCADE;
DROP TABLE IF EXISTS public.tariff_bands CASCADE;
DROP TABLE IF EXISTS public.tariff_orders CASCADE;
DROP TABLE IF EXISTS public.regulatory_actions CASCADE;
DROP TABLE IF EXISTS public.matters CASCADE;
DROP TABLE IF EXISTS public.distribution_performance CASCADE;
DROP TABLE IF EXISTS public.gas_supply CASCADE;
DROP TABLE IF EXISTS public.generation_output CASCADE;
DROP TABLE IF EXISTS public.transmission_data CASCADE;
DROP TABLE IF EXISTS public.power_plants CASCADE;
DROP TABLE IF EXISTS public.organisations CASCADE;
DROP TABLE IF EXISTS public.states CASCADE;


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Note: timescaledb extension removed (not required; schema uses native PG range partitioning)
--


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anomaly_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.anomaly_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id uuid NOT NULL,
    alert_date date NOT NULL,
    actual_output_mwh numeric,
    expected_output_mwh numeric,
    deviation_stddev numeric NOT NULL,
    alert_type text NOT NULL,
    explanation text,
    status text DEFAULT 'UNREVIEWED'::text NOT NULL,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_alert_status CHECK ((status = ANY (ARRAY['UNREVIEWED'::text, 'REVIEWED'::text, 'DISMISSED'::text]))),
    CONSTRAINT check_alert_type CHECK ((alert_type = ANY (ARRAY['HIGH_OUTPUT'::text, 'LOW_OUTPUT'::text, 'ZERO_OUTPUT'::text, 'CURTAILMENT_SPIKE'::text]))),
    CONSTRAINT check_deviation CHECK ((deviation_stddev > (0)::numeric))
);


ALTER TABLE public.anomaly_alerts OWNER TO postgres;

--
-- Name: conversation_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_account text,
    question text NOT NULL,
    generated_sql text,
    answer text,
    response_time_ms integer,
    was_successful boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_response_time CHECK (((response_time_ms IS NULL) OR (response_time_ms >= 0)))
);


ALTER TABLE public.conversation_log OWNER TO postgres;

--
-- Name: distribution_performance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.distribution_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    disco_id uuid NOT NULL,
    state_id uuid NOT NULL,
    report_date date NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text NOT NULL,
    peak_demand_mw numeric,
    energy_received_mwh numeric,
    energy_delivered_mwh numeric,
    atcc_losses_pct numeric,
    customers_served integer,
    billing_efficiency_pct numeric,
    collection_efficiency_pct numeric,
    outage_hours numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_atcc_losses CHECK (((atcc_losses_pct >= (0)::numeric) AND (atcc_losses_pct <= (100)::numeric))),
    CONSTRAINT check_billing_efficiency CHECK (((billing_efficiency_pct >= (0)::numeric) AND (billing_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_collection_efficiency CHECK (((collection_efficiency_pct >= (0)::numeric) AND (collection_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_customers_served CHECK ((customers_served >= 0)),
    CONSTRAINT check_dist_data_source CHECK ((data_source = ANY (ARRAY['NERC_REPORT'::text, 'DISCO_SUBMISSION'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_dist_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_outage_hours CHECK (((outage_hours >= (0)::numeric) AND (outage_hours <= (24)::numeric)))
)
PARTITION BY RANGE (report_date);


ALTER TABLE public.distribution_performance OWNER TO postgres;

--
-- Name: distribution_performance_2010_2015; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.distribution_performance_2010_2015 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT distribution_performance_id_not_null NOT NULL,
    disco_id uuid CONSTRAINT distribution_performance_disco_id_not_null NOT NULL,
    state_id uuid CONSTRAINT distribution_performance_state_id_not_null NOT NULL,
    report_date date CONSTRAINT distribution_performance_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT distribution_performance_report_status_not_null NOT NULL,
    peak_demand_mw numeric,
    energy_received_mwh numeric,
    energy_delivered_mwh numeric,
    atcc_losses_pct numeric,
    customers_served integer,
    billing_efficiency_pct numeric,
    collection_efficiency_pct numeric,
    outage_hours numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT distribution_performance_created_at_not_null NOT NULL,
    CONSTRAINT check_atcc_losses CHECK (((atcc_losses_pct >= (0)::numeric) AND (atcc_losses_pct <= (100)::numeric))),
    CONSTRAINT check_billing_efficiency CHECK (((billing_efficiency_pct >= (0)::numeric) AND (billing_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_collection_efficiency CHECK (((collection_efficiency_pct >= (0)::numeric) AND (collection_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_customers_served CHECK ((customers_served >= 0)),
    CONSTRAINT check_dist_data_source CHECK ((data_source = ANY (ARRAY['NERC_REPORT'::text, 'DISCO_SUBMISSION'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_dist_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_outage_hours CHECK (((outage_hours >= (0)::numeric) AND (outage_hours <= (24)::numeric)))
);


ALTER TABLE public.distribution_performance_2010_2015 OWNER TO postgres;

--
-- Name: distribution_performance_2016_2020; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.distribution_performance_2016_2020 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT distribution_performance_id_not_null NOT NULL,
    disco_id uuid CONSTRAINT distribution_performance_disco_id_not_null NOT NULL,
    state_id uuid CONSTRAINT distribution_performance_state_id_not_null NOT NULL,
    report_date date CONSTRAINT distribution_performance_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT distribution_performance_report_status_not_null NOT NULL,
    peak_demand_mw numeric,
    energy_received_mwh numeric,
    energy_delivered_mwh numeric,
    atcc_losses_pct numeric,
    customers_served integer,
    billing_efficiency_pct numeric,
    collection_efficiency_pct numeric,
    outage_hours numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT distribution_performance_created_at_not_null NOT NULL,
    CONSTRAINT check_atcc_losses CHECK (((atcc_losses_pct >= (0)::numeric) AND (atcc_losses_pct <= (100)::numeric))),
    CONSTRAINT check_billing_efficiency CHECK (((billing_efficiency_pct >= (0)::numeric) AND (billing_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_collection_efficiency CHECK (((collection_efficiency_pct >= (0)::numeric) AND (collection_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_customers_served CHECK ((customers_served >= 0)),
    CONSTRAINT check_dist_data_source CHECK ((data_source = ANY (ARRAY['NERC_REPORT'::text, 'DISCO_SUBMISSION'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_dist_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_outage_hours CHECK (((outage_hours >= (0)::numeric) AND (outage_hours <= (24)::numeric)))
);


ALTER TABLE public.distribution_performance_2016_2020 OWNER TO postgres;

--
-- Name: distribution_performance_2021_2025; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.distribution_performance_2021_2025 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT distribution_performance_id_not_null NOT NULL,
    disco_id uuid CONSTRAINT distribution_performance_disco_id_not_null NOT NULL,
    state_id uuid CONSTRAINT distribution_performance_state_id_not_null NOT NULL,
    report_date date CONSTRAINT distribution_performance_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT distribution_performance_report_status_not_null NOT NULL,
    peak_demand_mw numeric,
    energy_received_mwh numeric,
    energy_delivered_mwh numeric,
    atcc_losses_pct numeric,
    customers_served integer,
    billing_efficiency_pct numeric,
    collection_efficiency_pct numeric,
    outage_hours numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT distribution_performance_created_at_not_null NOT NULL,
    CONSTRAINT check_atcc_losses CHECK (((atcc_losses_pct >= (0)::numeric) AND (atcc_losses_pct <= (100)::numeric))),
    CONSTRAINT check_billing_efficiency CHECK (((billing_efficiency_pct >= (0)::numeric) AND (billing_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_collection_efficiency CHECK (((collection_efficiency_pct >= (0)::numeric) AND (collection_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_customers_served CHECK ((customers_served >= 0)),
    CONSTRAINT check_dist_data_source CHECK ((data_source = ANY (ARRAY['NERC_REPORT'::text, 'DISCO_SUBMISSION'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_dist_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_outage_hours CHECK (((outage_hours >= (0)::numeric) AND (outage_hours <= (24)::numeric)))
);


ALTER TABLE public.distribution_performance_2021_2025 OWNER TO postgres;

--
-- Name: distribution_performance_2026_2030; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.distribution_performance_2026_2030 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT distribution_performance_id_not_null NOT NULL,
    disco_id uuid CONSTRAINT distribution_performance_disco_id_not_null NOT NULL,
    state_id uuid CONSTRAINT distribution_performance_state_id_not_null NOT NULL,
    report_date date CONSTRAINT distribution_performance_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT distribution_performance_report_status_not_null NOT NULL,
    peak_demand_mw numeric,
    energy_received_mwh numeric,
    energy_delivered_mwh numeric,
    atcc_losses_pct numeric,
    customers_served integer,
    billing_efficiency_pct numeric,
    collection_efficiency_pct numeric,
    outage_hours numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT distribution_performance_created_at_not_null NOT NULL,
    CONSTRAINT check_atcc_losses CHECK (((atcc_losses_pct >= (0)::numeric) AND (atcc_losses_pct <= (100)::numeric))),
    CONSTRAINT check_billing_efficiency CHECK (((billing_efficiency_pct >= (0)::numeric) AND (billing_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_collection_efficiency CHECK (((collection_efficiency_pct >= (0)::numeric) AND (collection_efficiency_pct <= (100)::numeric))),
    CONSTRAINT check_customers_served CHECK ((customers_served >= 0)),
    CONSTRAINT check_dist_data_source CHECK ((data_source = ANY (ARRAY['NERC_REPORT'::text, 'DISCO_SUBMISSION'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_dist_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_outage_hours CHECK (((outage_hours >= (0)::numeric) AND (outage_hours <= (24)::numeric)))
);


ALTER TABLE public.distribution_performance_2026_2030 OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    document_type text NOT NULL,
    classification text DEFAULT 'INTERNAL'::text NOT NULL,
    s3_key text,
    file_size_bytes integer,
    page_count integer,
    matter_id uuid,
    regulatory_action_id uuid,
    uploaded_by text,
    processing_status text DEFAULT 'PENDING'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_classification CHECK ((classification = ANY (ARRAY['PUBLIC'::text, 'INTERNAL'::text, 'LEGAL_PRIVILEGED'::text]))),
    CONSTRAINT check_document_type CHECK ((document_type = ANY (ARRAY['REGULATORY_ORDER'::text, 'COURT_JUDGMENT'::text, 'POLICY_PAPER'::text, 'TARIFF_DETERMINATION'::text, 'MARKET_REPORT'::text, 'LEGAL_BRIEF'::text, 'BRIEFING_NOTE'::text, 'OTHER'::text]))),
    CONSTRAINT check_file_size CHECK (((file_size_bytes IS NULL) OR (file_size_bytes > 0))),
    CONSTRAINT check_page_count CHECK (((page_count IS NULL) OR (page_count > 0))),
    CONSTRAINT check_processing_status CHECK ((processing_status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'COMPLETE'::text, 'FAILED'::text])))
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: embeddings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_chunk_index CHECK ((chunk_index >= 0))
);


ALTER TABLE public.embeddings OWNER TO postgres;

--
-- Name: forecasts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.forecasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id uuid,
    forecast_type text NOT NULL,
    forecast_date date NOT NULL,
    generated_date date DEFAULT CURRENT_DATE NOT NULL,
    predicted_value numeric NOT NULL,
    lower_bound numeric,
    upper_bound numeric,
    horizon_days integer NOT NULL,
    model_used text NOT NULL,
    confidence_pct numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_bounds CHECK (((lower_bound IS NULL) OR (upper_bound IS NULL) OR (lower_bound <= upper_bound))),
    CONSTRAINT check_confidence_pct CHECK (((confidence_pct IS NULL) OR ((confidence_pct >= (0)::numeric) AND (confidence_pct <= (100)::numeric)))),
    CONSTRAINT check_forecast_type CHECK ((forecast_type = ANY (ARRAY['GENERATION'::text, 'TARIFF'::text]))),
    CONSTRAINT check_horizon_days CHECK ((horizon_days = ANY (ARRAY[30, 90]))),
    CONSTRAINT check_model_used CHECK ((model_used = ANY (ARRAY['PROPHET'::text, 'GRADIENT_BOOST'::text, 'OTHER'::text])))
);


ALTER TABLE public.forecasts OWNER TO postgres;

--
-- Name: gas_supply; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gas_supply (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id uuid NOT NULL,
    report_date date NOT NULL,
    nominations_mscf numeric,
    deliveries_mscf numeric,
    price_per_mscf numeric,
    supply_interruption boolean DEFAULT false,
    interruption_duration_hrs numeric,
    interruption_cause text,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_gas_data_source CHECK ((data_source = ANY (ARRAY['NNPC'::text, 'NDPRA'::text, 'NBET_SETTLEMENT'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_interruption_cause CHECK ((interruption_cause = ANY (ARRAY['PIPELINE_CONSTRAINT'::text, 'SUPPLIER_FAILURE'::text, 'FORCE_MAJEURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
)
PARTITION BY RANGE (report_date);


ALTER TABLE public.gas_supply OWNER TO postgres;

--
-- Name: gas_supply_2010_2015; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gas_supply_2010_2015 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT gas_supply_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT gas_supply_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT gas_supply_report_date_not_null NOT NULL,
    nominations_mscf numeric,
    deliveries_mscf numeric,
    price_per_mscf numeric,
    supply_interruption boolean DEFAULT false,
    interruption_duration_hrs numeric,
    interruption_cause text,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT gas_supply_created_at_not_null NOT NULL,
    CONSTRAINT check_gas_data_source CHECK ((data_source = ANY (ARRAY['NNPC'::text, 'NDPRA'::text, 'NBET_SETTLEMENT'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_interruption_cause CHECK ((interruption_cause = ANY (ARRAY['PIPELINE_CONSTRAINT'::text, 'SUPPLIER_FAILURE'::text, 'FORCE_MAJEURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.gas_supply_2010_2015 OWNER TO postgres;

--
-- Name: gas_supply_2016_2020; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gas_supply_2016_2020 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT gas_supply_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT gas_supply_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT gas_supply_report_date_not_null NOT NULL,
    nominations_mscf numeric,
    deliveries_mscf numeric,
    price_per_mscf numeric,
    supply_interruption boolean DEFAULT false,
    interruption_duration_hrs numeric,
    interruption_cause text,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT gas_supply_created_at_not_null NOT NULL,
    CONSTRAINT check_gas_data_source CHECK ((data_source = ANY (ARRAY['NNPC'::text, 'NDPRA'::text, 'NBET_SETTLEMENT'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_interruption_cause CHECK ((interruption_cause = ANY (ARRAY['PIPELINE_CONSTRAINT'::text, 'SUPPLIER_FAILURE'::text, 'FORCE_MAJEURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.gas_supply_2016_2020 OWNER TO postgres;

--
-- Name: gas_supply_2021_2025; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gas_supply_2021_2025 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT gas_supply_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT gas_supply_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT gas_supply_report_date_not_null NOT NULL,
    nominations_mscf numeric,
    deliveries_mscf numeric,
    price_per_mscf numeric,
    supply_interruption boolean DEFAULT false,
    interruption_duration_hrs numeric,
    interruption_cause text,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT gas_supply_created_at_not_null NOT NULL,
    CONSTRAINT check_gas_data_source CHECK ((data_source = ANY (ARRAY['NNPC'::text, 'NDPRA'::text, 'NBET_SETTLEMENT'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_interruption_cause CHECK ((interruption_cause = ANY (ARRAY['PIPELINE_CONSTRAINT'::text, 'SUPPLIER_FAILURE'::text, 'FORCE_MAJEURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.gas_supply_2021_2025 OWNER TO postgres;

--
-- Name: gas_supply_2026_2030; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gas_supply_2026_2030 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT gas_supply_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT gas_supply_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT gas_supply_report_date_not_null NOT NULL,
    nominations_mscf numeric,
    deliveries_mscf numeric,
    price_per_mscf numeric,
    supply_interruption boolean DEFAULT false,
    interruption_duration_hrs numeric,
    interruption_cause text,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT gas_supply_created_at_not_null NOT NULL,
    CONSTRAINT check_gas_data_source CHECK ((data_source = ANY (ARRAY['NNPC'::text, 'NDPRA'::text, 'NBET_SETTLEMENT'::text, 'MANUAL_ENTRY'::text]))),
    CONSTRAINT check_interruption_cause CHECK ((interruption_cause = ANY (ARRAY['PIPELINE_CONSTRAINT'::text, 'SUPPLIER_FAILURE'::text, 'FORCE_MAJEURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.gas_supply_2026_2030 OWNER TO postgres;

--
-- Name: generation_output; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_output (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plant_id uuid NOT NULL,
    report_date date NOT NULL,
    installed_capacity_mw numeric,
    available_capacity_mw numeric,
    actual_output_mwh numeric,
    energy_sent_out_mwh numeric,
    curtailed_mwh numeric,
    curtailment_cause text,
    load_factor numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_curtailment_cause CHECK ((curtailment_cause = ANY (ARRAY['GAS_CONSTRAINT'::text, 'TRANSMISSION_CONSTRAINT'::text, 'MECHANICAL_FAILURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
)
PARTITION BY RANGE (report_date);


ALTER TABLE public.generation_output OWNER TO postgres;

--
-- Name: generation_output_2010_2015; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_output_2010_2015 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT generation_output_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT generation_output_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT generation_output_report_date_not_null NOT NULL,
    installed_capacity_mw numeric,
    available_capacity_mw numeric,
    actual_output_mwh numeric,
    energy_sent_out_mwh numeric,
    curtailed_mwh numeric,
    curtailment_cause text,
    load_factor numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT generation_output_created_at_not_null NOT NULL,
    CONSTRAINT check_curtailment_cause CHECK ((curtailment_cause = ANY (ARRAY['GAS_CONSTRAINT'::text, 'TRANSMISSION_CONSTRAINT'::text, 'MECHANICAL_FAILURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.generation_output_2010_2015 OWNER TO postgres;

--
-- Name: generation_output_2016_2020; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_output_2016_2020 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT generation_output_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT generation_output_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT generation_output_report_date_not_null NOT NULL,
    installed_capacity_mw numeric,
    available_capacity_mw numeric,
    actual_output_mwh numeric,
    energy_sent_out_mwh numeric,
    curtailed_mwh numeric,
    curtailment_cause text,
    load_factor numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT generation_output_created_at_not_null NOT NULL,
    CONSTRAINT check_curtailment_cause CHECK ((curtailment_cause = ANY (ARRAY['GAS_CONSTRAINT'::text, 'TRANSMISSION_CONSTRAINT'::text, 'MECHANICAL_FAILURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.generation_output_2016_2020 OWNER TO postgres;

--
-- Name: generation_output_2021_2025; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_output_2021_2025 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT generation_output_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT generation_output_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT generation_output_report_date_not_null NOT NULL,
    installed_capacity_mw numeric,
    available_capacity_mw numeric,
    actual_output_mwh numeric,
    energy_sent_out_mwh numeric,
    curtailed_mwh numeric,
    curtailment_cause text,
    load_factor numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT generation_output_created_at_not_null NOT NULL,
    CONSTRAINT check_curtailment_cause CHECK ((curtailment_cause = ANY (ARRAY['GAS_CONSTRAINT'::text, 'TRANSMISSION_CONSTRAINT'::text, 'MECHANICAL_FAILURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.generation_output_2021_2025 OWNER TO postgres;

--
-- Name: generation_output_2026_2030; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_output_2026_2030 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT generation_output_id_not_null NOT NULL,
    plant_id uuid CONSTRAINT generation_output_plant_id_not_null NOT NULL,
    report_date date CONSTRAINT generation_output_report_date_not_null NOT NULL,
    installed_capacity_mw numeric,
    available_capacity_mw numeric,
    actual_output_mwh numeric,
    energy_sent_out_mwh numeric,
    curtailed_mwh numeric,
    curtailment_cause text,
    load_factor numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT generation_output_created_at_not_null NOT NULL,
    CONSTRAINT check_curtailment_cause CHECK ((curtailment_cause = ANY (ARRAY['GAS_CONSTRAINT'::text, 'TRANSMISSION_CONSTRAINT'::text, 'MECHANICAL_FAILURE'::text, 'COMMERCIAL'::text, 'OTHER'::text])))
);


ALTER TABLE public.generation_output_2026_2030 OWNER TO postgres;

--
-- Name: matters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    matter_reference character varying(50),
    matter_type text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    lead_counsel text,
    date_opened date DEFAULT CURRENT_DATE NOT NULL,
    date_closed date,
    next_deadline date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT check_date_closed CHECK (((date_closed IS NULL) OR (date_closed >= date_opened))),
    CONSTRAINT check_matter_status CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CLOSED'::text, 'ON_HOLD'::text, 'PENDING'::text]))),
    CONSTRAINT check_matter_type CHECK ((matter_type = ANY (ARRAY['LITIGATION'::text, 'ARBITRATION'::text, 'REGULATORY_ADVISORY'::text, 'LICENSING'::text, 'TARIFF_DISPUTE'::text, 'OTHER'::text])))
);


ALTER TABLE public.matters OWNER TO postgres;

--
-- Name: organisations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organisations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(1000) NOT NULL,
    short_name character varying(20),
    org_type character varying(20) NOT NULL,
    rc_number character varying(20),
    date_licensed date,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    state_id uuid,
    website character varying(1000),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    license_status character varying(20),
    CONSTRAINT check_license_status CHECK (((license_status)::text = ANY ((ARRAY['RENEWED'::character varying, 'UNDER REVIEW'::character varying, 'REPOSSESSED'::character varying])::text[]))),
    CONSTRAINT check_org_type CHECK (((org_type)::text = ANY ((ARRAY['GENCO'::character varying, 'DISCO'::character varying, 'TCN'::character varying, 'NBET'::character varying, 'NERC'::character varying, 'NEMSA'::character varying, 'IPP'::character varying, 'STATE_AGENCY'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT check_status CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'REVOKED'::text, 'SUSPENDED'::text, 'DEREGISTERED'::text])))
);


ALTER TABLE public.organisations OWNER TO postgres;

--
-- Name: power_plants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.power_plants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(1000) NOT NULL,
    short_name character varying(20),
    owner_id uuid,
    gas_supplier_id uuid,
    state_id uuid,
    lga character varying(1000),
    plant_type character varying(1000),
    fuel_source character varying(1000),
    installed_capacity_mw numeric,
    available_capacity_mw numeric,
    commissioned_date date,
    nerc_license_number character varying(50),
    grid_connection_point character varying(1000),
    status character varying(1000) DEFAULT 'OPERATIONAL'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT check_fuel_source CHECK (((fuel_source)::text = ANY ((ARRAY['GAS'::character varying, 'DIESEL'::character varying, 'HFO'::character varying, 'WATER'::character varying, 'SOLAR'::character varying, 'WIND'::character varying])::text[]))),
    CONSTRAINT check_plant_status CHECK (((status)::text = ANY ((ARRAY['OPERATIONAL'::character varying, 'MOTHBALLED'::character varying, 'DECOMMISSIONED'::character varying, 'UNDER_CONSTRUCTION'::character varying])::text[]))),
    CONSTRAINT check_plant_type CHECK (((plant_type)::text = ANY ((ARRAY['THERMAL'::character varying, 'HYDRO'::character varying, 'SOLAR'::character varying, 'WIND'::character varying, 'OTHER'::character varying])::text[])))
);


ALTER TABLE public.power_plants OWNER TO postgres;

--
-- Name: regulatory_actions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.regulatory_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    action_type text NOT NULL,
    action_date date NOT NULL,
    reference_number character varying(50),
    fine_amount numeric,
    description text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_action_status CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'RESOLVED'::text, 'APPEALED'::text, 'WITHDRAWN'::text]))),
    CONSTRAINT check_action_type CHECK ((action_type = ANY (ARRAY['FINE'::text, 'LICENCE_REVOCATION'::text, 'LICENCE_SUSPENSION'::text, 'DIRECTIVE'::text, 'INVESTIGATION'::text, 'WARNING'::text, 'APPROVAL'::text]))),
    CONSTRAINT check_fine_positive CHECK (((fine_amount IS NULL) OR (fine_amount >= (0)::numeric)))
);


ALTER TABLE public.regulatory_actions OWNER TO postgres;

--
-- Name: states; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(20) NOT NULL,
    code character(2) NOT NULL,
    geopolitical_zone character varying(15),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.states OWNER TO postgres;

--
-- Name: tariff_bands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tariff_bands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    disco_id uuid NOT NULL,
    band text NOT NULL,
    customer_category text NOT NULL,
    rate_per_kwh numeric NOT NULL,
    fixed_charge numeric,
    effective_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_band CHECK ((band = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text]))),
    CONSTRAINT check_customer_category CHECK ((customer_category = ANY (ARRAY['RESIDENTIAL'::text, 'COMMERCIAL'::text, 'INDUSTRIAL'::text, 'SPECIAL'::text]))),
    CONSTRAINT check_rate_positive CHECK ((rate_per_kwh > (0)::numeric))
);


ALTER TABLE public.tariff_bands OWNER TO postgres;

--
-- Name: tariff_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tariff_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    order_reference character varying(50),
    order_type text NOT NULL,
    effective_date date NOT NULL,
    expiry_date date,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_order_type CHECK ((order_type = ANY (ARRAY['MYTO'::text, 'SUPPLEMENTARY'::text, 'INTERIM'::text, 'REVIEW'::text]))),
    CONSTRAINT check_tariff_status CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'SUPERSEDED'::text, 'EXPIRED'::text])))
);


ALTER TABLE public.tariff_orders OWNER TO postgres;

--
-- Name: transmission_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transmission_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_date date NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text NOT NULL,
    total_generation_mw numeric,
    total_transmission_mw numeric,
    system_peak_mw numeric,
    system_peak_time time without time zone,
    transmission_losses_pct numeric,
    grid_frequency_hz numeric,
    grid_collapses integer DEFAULT 0,
    constraints_mw numeric,
    energy_exported_mwh numeric,
    energy_imported_mwh numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_grid_collapses CHECK ((grid_collapses >= 0)),
    CONSTRAINT check_losses_pct CHECK (((transmission_losses_pct >= (0)::numeric) AND (transmission_losses_pct <= (100)::numeric))),
    CONSTRAINT check_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_transmission_data_source CHECK ((data_source = ANY (ARRAY['TCN_DAILY_REPORT'::text, 'MANUAL_ENTRY'::text])))
)
PARTITION BY RANGE (report_date);


ALTER TABLE public.transmission_data OWNER TO postgres;

--
-- Name: transmission_data_2010_2015; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transmission_data_2010_2015 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT transmission_data_id_not_null NOT NULL,
    report_date date CONSTRAINT transmission_data_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT transmission_data_report_status_not_null NOT NULL,
    total_generation_mw numeric,
    total_transmission_mw numeric,
    system_peak_mw numeric,
    system_peak_time time without time zone,
    transmission_losses_pct numeric,
    grid_frequency_hz numeric,
    grid_collapses integer DEFAULT 0,
    constraints_mw numeric,
    energy_exported_mwh numeric,
    energy_imported_mwh numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT transmission_data_created_at_not_null NOT NULL,
    CONSTRAINT check_grid_collapses CHECK ((grid_collapses >= 0)),
    CONSTRAINT check_losses_pct CHECK (((transmission_losses_pct >= (0)::numeric) AND (transmission_losses_pct <= (100)::numeric))),
    CONSTRAINT check_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_transmission_data_source CHECK ((data_source = ANY (ARRAY['TCN_DAILY_REPORT'::text, 'MANUAL_ENTRY'::text])))
);


ALTER TABLE public.transmission_data_2010_2015 OWNER TO postgres;

--
-- Name: transmission_data_2016_2020; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transmission_data_2016_2020 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT transmission_data_id_not_null NOT NULL,
    report_date date CONSTRAINT transmission_data_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT transmission_data_report_status_not_null NOT NULL,
    total_generation_mw numeric,
    total_transmission_mw numeric,
    system_peak_mw numeric,
    system_peak_time time without time zone,
    transmission_losses_pct numeric,
    grid_frequency_hz numeric,
    grid_collapses integer DEFAULT 0,
    constraints_mw numeric,
    energy_exported_mwh numeric,
    energy_imported_mwh numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT transmission_data_created_at_not_null NOT NULL,
    CONSTRAINT check_grid_collapses CHECK ((grid_collapses >= 0)),
    CONSTRAINT check_losses_pct CHECK (((transmission_losses_pct >= (0)::numeric) AND (transmission_losses_pct <= (100)::numeric))),
    CONSTRAINT check_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_transmission_data_source CHECK ((data_source = ANY (ARRAY['TCN_DAILY_REPORT'::text, 'MANUAL_ENTRY'::text])))
);


ALTER TABLE public.transmission_data_2016_2020 OWNER TO postgres;

--
-- Name: transmission_data_2021_2025; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transmission_data_2021_2025 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT transmission_data_id_not_null NOT NULL,
    report_date date CONSTRAINT transmission_data_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT transmission_data_report_status_not_null NOT NULL,
    total_generation_mw numeric,
    total_transmission_mw numeric,
    system_peak_mw numeric,
    system_peak_time time without time zone,
    transmission_losses_pct numeric,
    grid_frequency_hz numeric,
    grid_collapses integer DEFAULT 0,
    constraints_mw numeric,
    energy_exported_mwh numeric,
    energy_imported_mwh numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT transmission_data_created_at_not_null NOT NULL,
    CONSTRAINT check_grid_collapses CHECK ((grid_collapses >= 0)),
    CONSTRAINT check_losses_pct CHECK (((transmission_losses_pct >= (0)::numeric) AND (transmission_losses_pct <= (100)::numeric))),
    CONSTRAINT check_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_transmission_data_source CHECK ((data_source = ANY (ARRAY['TCN_DAILY_REPORT'::text, 'MANUAL_ENTRY'::text])))
);


ALTER TABLE public.transmission_data_2021_2025 OWNER TO postgres;

--
-- Name: transmission_data_2026_2030; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transmission_data_2026_2030 (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT transmission_data_id_not_null NOT NULL,
    report_date date CONSTRAINT transmission_data_report_date_not_null NOT NULL,
    report_received_date date,
    report_status text DEFAULT 'MISSING'::text CONSTRAINT transmission_data_report_status_not_null NOT NULL,
    total_generation_mw numeric,
    total_transmission_mw numeric,
    system_peak_mw numeric,
    system_peak_time time without time zone,
    transmission_losses_pct numeric,
    grid_frequency_hz numeric,
    grid_collapses integer DEFAULT 0,
    constraints_mw numeric,
    energy_exported_mwh numeric,
    energy_imported_mwh numeric,
    data_source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT transmission_data_created_at_not_null NOT NULL,
    CONSTRAINT check_grid_collapses CHECK ((grid_collapses >= 0)),
    CONSTRAINT check_losses_pct CHECK (((transmission_losses_pct >= (0)::numeric) AND (transmission_losses_pct <= (100)::numeric))),
    CONSTRAINT check_report_status CHECK ((report_status = ANY (ARRAY['COMPLETE'::text, 'PROVISIONAL'::text, 'MISSING'::text, 'ESTIMATED'::text]))),
    CONSTRAINT check_transmission_data_source CHECK ((data_source = ANY (ARRAY['TCN_DAILY_REPORT'::text, 'MANUAL_ENTRY'::text])))
);


ALTER TABLE public.transmission_data_2026_2030 OWNER TO postgres;

--
-- Name: distribution_performance_2010_2015; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance ATTACH PARTITION public.distribution_performance_2010_2015 FOR VALUES FROM ('2010-01-01') TO ('2016-01-01');


--
-- Name: distribution_performance_2016_2020; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance ATTACH PARTITION public.distribution_performance_2016_2020 FOR VALUES FROM ('2016-01-01') TO ('2021-01-01');


--
-- Name: distribution_performance_2021_2025; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance ATTACH PARTITION public.distribution_performance_2021_2025 FOR VALUES FROM ('2021-01-01') TO ('2026-01-01');


--
-- Name: distribution_performance_2026_2030; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance ATTACH PARTITION public.distribution_performance_2026_2030 FOR VALUES FROM ('2026-01-01') TO ('2031-01-01');


--
-- Name: gas_supply_2010_2015; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gas_supply ATTACH PARTITION public.gas_supply_2010_2015 FOR VALUES FROM ('2010-01-01') TO ('2016-01-01');


--
-- Name: gas_supply_2016_2020; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gas_supply ATTACH PARTITION public.gas_supply_2016_2020 FOR VALUES FROM ('2016-01-01') TO ('2021-01-01');


--
-- Name: gas_supply_2021_2025; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gas_supply ATTACH PARTITION public.gas_supply_2021_2025 FOR VALUES FROM ('2021-01-01') TO ('2026-01-01');


--
-- Name: gas_supply_2026_2030; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gas_supply ATTACH PARTITION public.gas_supply_2026_2030 FOR VALUES FROM ('2026-01-01') TO ('2031-01-01');


--
-- Name: generation_output_2010_2015; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_output ATTACH PARTITION public.generation_output_2010_2015 FOR VALUES FROM ('2010-01-01') TO ('2016-01-01');


--
-- Name: generation_output_2016_2020; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_output ATTACH PARTITION public.generation_output_2016_2020 FOR VALUES FROM ('2016-01-01') TO ('2021-01-01');


--
-- Name: generation_output_2021_2025; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_output ATTACH PARTITION public.generation_output_2021_2025 FOR VALUES FROM ('2021-01-01') TO ('2026-01-01');


--
-- Name: generation_output_2026_2030; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_output ATTACH PARTITION public.generation_output_2026_2030 FOR VALUES FROM ('2026-01-01') TO ('2031-01-01');


--
-- Name: transmission_data_2010_2015; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data ATTACH PARTITION public.transmission_data_2010_2015 FOR VALUES FROM ('2010-01-01') TO ('2016-01-01');


--
-- Name: transmission_data_2016_2020; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data ATTACH PARTITION public.transmission_data_2016_2020 FOR VALUES FROM ('2016-01-01') TO ('2021-01-01');


--
-- Name: transmission_data_2021_2025; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data ATTACH PARTITION public.transmission_data_2021_2025 FOR VALUES FROM ('2021-01-01') TO ('2026-01-01');


--
-- Name: transmission_data_2026_2030; Type: TABLE ATTACH; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data ATTACH PARTITION public.transmission_data_2026_2030 FOR VALUES FROM ('2026-01-01') TO ('2031-01-01');


--
-- Name: distribution_performance uq_disco_state_date; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance
    ADD CONSTRAINT uq_disco_state_date UNIQUE (disco_id, state_id, report_date);


--
-- Name: distribution_performance_2010_2015 distribution_performance_2010_disco_id_state_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance_2010_2015
    ADD CONSTRAINT distribution_performance_2010_disco_id_state_id_report_date_key UNIQUE (disco_id, state_id, report_date);


--
-- Name: distribution_performance_2016_2020 distribution_performance_2016_disco_id_state_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance_2016_2020
    ADD CONSTRAINT distribution_performance_2016_disco_id_state_id_report_date_key UNIQUE (disco_id, state_id, report_date);


--
-- Name: distribution_performance_2021_2025 distribution_performance_2021_disco_id_state_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance_2021_2025
    ADD CONSTRAINT distribution_performance_2021_disco_id_state_id_report_date_key UNIQUE (disco_id, state_id, report_date);


--
-- Name: distribution_performance_2026_2030 distribution_performance_2026_disco_id_state_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.distribution_performance_2026_2030
    ADD CONSTRAINT distribution_performance_2026_disco_id_state_id_report_date_key UNIQUE (disco_id, state_id, report_date);


--
-- Name: organisations organisations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);


--
-- Name: anomaly_alerts pk_anomaly_alerts; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.anomaly_alerts
    ADD CONSTRAINT pk_anomaly_alerts PRIMARY KEY (id);


--
-- Name: conversation_log pk_conversation_log; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation_log
    ADD CONSTRAINT pk_conversation_log PRIMARY KEY (id);


--
-- Name: documents pk_documents; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT pk_documents PRIMARY KEY (id);


--
-- Name: embeddings pk_embeddings; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT pk_embeddings PRIMARY KEY (id);


--
-- Name: forecasts pk_forecasts; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.forecasts
    ADD CONSTRAINT pk_forecasts PRIMARY KEY (id);


--
-- Name: matters pk_matters; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matters
    ADD CONSTRAINT pk_matters PRIMARY KEY (id);


--
-- Name: regulatory_actions pk_regulatory_actions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regulatory_actions
    ADD CONSTRAINT pk_regulatory_actions PRIMARY KEY (id);


--
-- Name: tariff_orders pk_tariff_orders; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tariff_orders
    ADD CONSTRAINT pk_tariff_orders PRIMARY KEY (id);


--
-- Name: power_plants power_plants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.power_plants
    ADD CONSTRAINT power_plants_pkey PRIMARY KEY (id);


--
-- Name: states states_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_name_key UNIQUE (name);


--
-- Name: states states_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (id);


--
-- Name: transmission_data uq_transmission_date; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data
    ADD CONSTRAINT uq_transmission_date UNIQUE (report_date);


--
-- Name: transmission_data_2010_2015 transmission_data_2010_2015_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data_2010_2015
    ADD CONSTRAINT transmission_data_2010_2015_report_date_key UNIQUE (report_date);


--
-- Name: transmission_data_2016_2020 transmission_data_2016_2020_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data_2016_2020
    ADD CONSTRAINT transmission_data_2016_2020_report_date_key UNIQUE (report_date);


--
-- Name: transmission_data_2021_2025 transmission_data_2021_2025_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data_2021_2025
    ADD CONSTRAINT transmission_data_2021_2025_report_date_key UNIQUE (report_date);


--
-- Name: transmission_data_2026_2030 transmission_data_2026_2030_report_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transmission_data_2026_2030
    ADD CONSTRAINT transmission_data_2026_2030_report_date_key UNIQUE (report_date);


--
-- Name: organisations unique_org_name; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT unique_org_name UNIQUE (name);


--
-- Name: tariff_bands uq_band_disco_order; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tariff_bands
    ADD CONSTRAINT uq_band_disco_order UNIQUE (order_id, disco_id, band, customer_category);


--
-- Name: embeddings uq_document_chunk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT uq_document_chunk UNIQUE (document_id, chunk_index);


--
-- Name: matters uq_matter_reference; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matters
    ADD CONSTRAINT uq_matter_reference UNIQUE (matter_reference);


--
-- Name: tariff_orders uq_order_reference; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tariff_orders
    ADD CONSTRAINT uq_order_reference UNIQUE (order_reference);


--
-- Name: idx_conversation_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversation_created_at ON public.conversation_log USING btree (created_at DESC);


--
-- Name: idx_conversation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversation_id ON public.conversation_log USING btree (conversation_id);


--
-- Name: distribution_performance_2010_disco_id_state_id_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_disco_state_date ATTACH PARTITION public.distribution_performance_2010_disco_id_state_id_report_date_key;


--
-- Name: distribution_performance_2016_disco_id_state_id_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_disco_state_date ATTACH PARTITION public.distribution_performance_2016_disco_id_state_id_report_date_key;


--
-- Name: distribution_performance_2021_disco_id_state_id_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_disco_state_date ATTACH PARTITION public.distribution_performance_2021_disco_id_state_id_report_date_key;


--
-- Name: distribution_performance_2026_disco_id_state_id_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_disco_state_date ATTACH PARTITION public.distribution_performance_2026_disco_id_state_id_report_date_key;


--
-- Name: transmission_data_2010_2015_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_transmission_date ATTACH PARTITION public.transmission_data_2010_2015_report_date_key;


--
-- Name: transmission_data_2016_2020_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_transmission_date ATTACH PARTITION public.transmission_data_2016_2020_report_date_key;


--
-- Name: transmission_data_2021_2025_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_transmission_date ATTACH PARTITION public.transmission_data_2021_2025_report_date_key;


--
-- Name: transmission_data_2026_2030_report_date_key; Type: INDEX ATTACH; Schema: public; Owner: postgres
--

ALTER INDEX public.uq_transmission_date ATTACH PARTITION public.transmission_data_2026_2030_report_date_key;


--
-- Name: regulatory_actions fk_action_org; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regulatory_actions
    ADD CONSTRAINT fk_action_org FOREIGN KEY (org_id) REFERENCES public.organisations(id);


--
-- Name: anomaly_alerts fk_alert_plant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.anomaly_alerts
    ADD CONSTRAINT fk_alert_plant FOREIGN KEY (plant_id) REFERENCES public.power_plants(id);


--
-- Name: tariff_bands fk_band_disco; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tariff_bands
    ADD CONSTRAINT fk_band_disco FOREIGN KEY (disco_id) REFERENCES public.organisations(id);


--
-- Name: tariff_bands fk_band_order; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tariff_bands
    ADD CONSTRAINT fk_band_order FOREIGN KEY (order_id) REFERENCES public.tariff_orders(id);


--
-- Name: distribution_performance fk_disco; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.distribution_performance
    ADD CONSTRAINT fk_disco FOREIGN KEY (disco_id) REFERENCES public.organisations(id);


--
-- Name: distribution_performance fk_dist_state; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.distribution_performance
    ADD CONSTRAINT fk_dist_state FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: documents fk_document_matter; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT fk_document_matter FOREIGN KEY (matter_id) REFERENCES public.matters(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: documents fk_document_regulatory_action; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT fk_document_regulatory_action FOREIGN KEY (regulatory_action_id) REFERENCES public.regulatory_actions(id);


--
-- Name: embeddings fk_embedding_document; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT fk_embedding_document FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: forecasts fk_forecast_plant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.forecasts
    ADD CONSTRAINT fk_forecast_plant FOREIGN KEY (plant_id) REFERENCES public.power_plants(id);


--
-- Name: gas_supply fk_gas_plant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.gas_supply
    ADD CONSTRAINT fk_gas_plant FOREIGN KEY (plant_id) REFERENCES public.power_plants(id);


--
-- Name: power_plants fk_gas_supplier; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.power_plants
    ADD CONSTRAINT fk_gas_supplier FOREIGN KEY (gas_supplier_id) REFERENCES public.organisations(id);


--
-- Name: generation_output fk_gen_plant; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.generation_output
    ADD CONSTRAINT fk_gen_plant FOREIGN KEY (plant_id) REFERENCES public.power_plants(id);


--
-- Name: matters fk_matter_client; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matters
    ADD CONSTRAINT fk_matter_client FOREIGN KEY (client_id) REFERENCES public.organisations(id);


--
-- Name: organisations fk_organisations_state; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT fk_organisations_state FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: power_plants fk_owner; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.power_plants
    ADD CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES public.organisations(id);


--
-- Name: power_plants fk_state; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.power_plants
    ADD CONSTRAINT fk_state FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: tariff_orders fk_tariff_org; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tariff_orders
    ADD CONSTRAINT fk_tariff_org FOREIGN KEY (org_id) REFERENCES public.organisations(id);


--
-- ACL / Role grants removed.
-- Original roles (power_app, power_analyst, power_ingestion, power_ceo, power_team)
-- were from the source Supabase environment. Re-create and grant as needed.
--


--
-- PostgreSQL database dump complete
--



