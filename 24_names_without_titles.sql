-- 24_names_without_titles.sql
-- House style: users' names are stored without titles such as Mr, Mrs, Ms, Miss,
-- Dr, Barr, Engr, Prof, Hon, Chief, Alhaji, Rev, His Excellency / HE, and
-- without "Esq." or ", SAN" after them. A name typed in the Admin Panel or on
-- Profile & Settings, or sent by Microsoft 365 at first sign-in, is cleaned
-- whenever it is saved. Applies to user_profiles.full_name and
-- matters.lead_counsel. Existing names are cleaned too. Safe to run more than once.

-- 1. The rule: remove leading titles (several in a row, e.g. "Dr. Mrs") and trailing
--    "Esq." / ", SAN". Keeps the name as it was if nothing would be left.
CREATE OR REPLACE FUNCTION private.remove_name_titles(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN name IS NULL THEN NULL
        ELSE coalesce(nullif(btrim(
            pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(
                    name,
                    '^\s*((mr|mrs|ms|miss|mx|dr|doctor|barr|barrister|engr|engineer|prof|professor|hon|honourable|honorable|chief|alhaji|alhaja|hajia|mallam|malam|otunba|rev|revd|reverend|pastor|pharm|arc|sen|senator|sir|dame|madam|comrade|comr|amb|ambassador|his excellency|her excellency|h\.?\s?e)(\.\s*|\s+))+',
                    '', 'i'),
                '(\s*,?\s*esq\.?|\s*,\s*san)\s*$', '', 'i')
        ), ''), btrim(name))
    END
$$;

REVOKE EXECUTE ON FUNCTION private.remove_name_titles(text) FROM PUBLIC, anon, authenticated;

-- 2. Triggers: clean the name whenever it is inserted or changed. SECURITY DEFINER so a
--    person editing their own name may run the cleaning rule (EXECUTE is revoked from them).
CREATE OR REPLACE FUNCTION private.clean_profile_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.full_name := private.remove_name_titles(NEW.full_name);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.clean_lead_counsel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.lead_counsel := private.remove_name_titles(NEW.lead_counsel);
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.clean_profile_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.clean_lead_counsel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clean_profile_name ON public.user_profiles;
CREATE TRIGGER clean_profile_name
    BEFORE INSERT OR UPDATE OF full_name ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION private.clean_profile_name();

DROP TRIGGER IF EXISTS clean_lead_counsel ON public.matters;
CREATE TRIGGER clean_lead_counsel
    BEFORE INSERT OR UPDATE OF lead_counsel ON public.matters
    FOR EACH ROW EXECUTE FUNCTION private.clean_lead_counsel();

-- 3. Clean any names already stored.
UPDATE public.user_profiles SET full_name = full_name
WHERE full_name IS DISTINCT FROM private.remove_name_titles(full_name);
UPDATE public.matters SET lead_counsel = lead_counsel
WHERE lead_counsel IS DISTINCT FROM private.remove_name_titles(lead_counsel);
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', private.remove_name_titles(raw_user_meta_data->>'full_name'))
WHERE raw_user_meta_data ? 'full_name'
  AND raw_user_meta_data->>'full_name' IS DISTINCT FROM private.remove_name_titles(raw_user_meta_data->>'full_name');
