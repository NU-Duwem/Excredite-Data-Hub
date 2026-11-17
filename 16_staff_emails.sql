-- ============================================================
-- EPDH – Staff sign-in emails (November 2026)
-- Run this in the Supabase SQL Editor. Safe to run more than once.
--
--   1. Moves each person to their short company address
--      (firstname@excredite.ng). This changes both the sign-in email
--      and the profile email. Passwords, roles and everything the person
--      owns stay the same.
--   2. Removes the shared admin@excredite.ng account. It owned nothing
--      except its own activity-log entries, which are removed with it.
--
-- The addresses are changed directly and marked confirmed, so Supabase
-- sends no confirmation emails.
-- ============================================================

BEGIN;

CREATE TEMP TABLE staff_email_moves (old_email text PRIMARY KEY, new_email text NOT NULL) ON COMMIT DROP;
INSERT INTO staff_email_moves VALUES
  ('duwem.nwapi@excredite.ng',    'duwem@excredite.ng'),
  ('eyo.expo@excredite.ng',       'eyo@excredite.ng'),
  ('philip.expo@excredite.ng',    'phillip@excredite.ng'),
  ('taiwo.odugbemi@excredite.ng', 'taiwo@excredite.ng'),
  ('osefan.anegbe@excredite.ng',  'osefan@excredite.ng');

-- Sign-in accounts
UPDATE auth.users u
SET email = m.new_email,
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    email_change_confirm_status = 0,
    raw_user_meta_data = jsonb_set(COALESCE(u.raw_user_meta_data, '{}'::jsonb), '{email}', to_jsonb(m.new_email)),
    updated_at = now()
FROM staff_email_moves m
WHERE lower(u.email) = m.old_email;

-- Email sign-in identities carry their own copy of the address
UPDATE auth.identities i
SET identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(u.email)),
    updated_at = now()
FROM auth.users u
WHERE i.user_id = u.id
  AND i.provider = 'email'
  AND i.identity_data->>'email' IS DISTINCT FROM u.email;

-- Profiles follow the sign-in email
UPDATE public.user_profiles p
SET email = u.email, updated_at = now()
FROM auth.users u
WHERE p.id = u.id AND p.email IS DISTINCT FROM u.email;

-- Remove the shared admin account (cascades to its profile, sessions,
-- identities and activity log)
DELETE FROM auth.users WHERE lower(email) = 'admin@excredite.ng';

COMMIT;

-- Check: every profile email matches its sign-in email
SELECT p.full_name, u.email AS sign_in_email, p.email AS profile_email, p.role
FROM public.user_profiles p JOIN auth.users u ON u.id = p.id
ORDER BY p.full_name;
