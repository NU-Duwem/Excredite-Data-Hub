-- ============================================================
-- EPDH – DB Schema Updates and Matters Seed Data
-- ============================================================

-- Drop the rigid document_type check constraint so custom types are allowed
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS check_document_type;

-- Seed Legal Matters into the matters table to enable toggle autocomplete search and traceability
INSERT INTO public.matters (client_id, matter_reference, matter_type, title, status, lead_counsel, next_deadline)
VALUES
(
    (SELECT id FROM organisations WHERE short_name = 'AEDC' LIMIT 1),
    'LIT/2025/08', 'TARIFF_DISPUTE', 'DISCO Tariff Dispute case', 'ACTIVE', 'B. Ekpo', '2026-06-01'
),
(
    (SELECT id FROM organisations WHERE short_name = 'MAINSTREAM' LIMIT 1),
    'REG/2025/12', 'OTHER', 'Compliance audit matter', 'ON_HOLD', 'J. Doe', '2026-05-20'
),
(
    (SELECT id FROM organisations WHERE short_name = 'EGBIN' LIMIT 1),
    'APP/2026/01', 'LITIGATION', 'Egbin Thermal Contractual Dispute', 'ACTIVE', 'B. Ekpo', '2026-07-15'
)
ON CONFLICT DO NOTHING;
