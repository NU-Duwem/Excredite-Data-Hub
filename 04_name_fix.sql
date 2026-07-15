-- ============================================================
-- EPDH – Name Correction Migration
-- Run this in the Supabase SQL Editor
-- Fixes: "Expo" → "Ekpo" in user profile names and emails
-- ============================================================

-- Update full_name in user_profiles where it contains "Expo"
UPDATE public.user_profiles
SET full_name = REPLACE(full_name, 'Expo', 'Ekpo')
WHERE full_name ILIKE '%Expo%';

-- Update email in user_profiles where it contains "expo" (case-insensitive)
UPDATE public.user_profiles
SET email = REPLACE(REPLACE(email, 'Expo', 'Ekpo'), 'expo', 'ekpo')
WHERE email ILIKE '%expo%';

-- Also update full_name in auth.users metadata if applicable
-- Note: This requires service_role or admin access
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    raw_user_meta_data,
    '{full_name}',
    to_jsonb(REPLACE(raw_user_meta_data->>'full_name', 'Expo', 'Ekpo'))
)
WHERE raw_user_meta_data->>'full_name' ILIKE '%Expo%';

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT id, full_name, email FROM public.user_profiles WHERE full_name ILIKE '%ekpo%' OR email ILIKE '%ekpo%';
