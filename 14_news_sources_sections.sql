-- ============================================================
-- EPDH – News sources: use power/energy sections, not front pages
-- Run this in the Supabase SQL Editor AFTER 13_alerts.sql.
-- Safe to run more than once (each change only applies to the old address).
--
-- A newspaper's main feed carries its latest stories on every topic, so
-- power stories scroll out before they are pulled. Tested on 17 Nov 2026
-- with the app's own parser and filter, the main feeds of these five
-- outlets gave 0–1 power stories; their electricity tags and energy
-- sections gave 2–19 each.
--
--   Vanguard       main feed → electricity tag   (keyword filter off)
--   Daily Trust    main feed → electricity tag   (keyword filter off)
--   Premium Times  main feed → electricity tag   (keyword filter off)
--   BusinessDay    main feed → energy section    (filter on: also oil & gas)
--   Nairametrics   main feed → energy section    (filter on: also oil & gas)
--   + new source:  Premium Times (NERC), the outlet's NERC tag
--
-- Stories already pulled stay linked to their outlet.
-- ============================================================

UPDATE public.news_sources
SET feed_url = 'https://www.vanguardngr.com/tag/electricity/feed/', filter_by_keywords = false,
    notes = 'Electricity tag feed (the main feed rarely carried power stories).'
WHERE feed_url = 'https://www.vanguardngr.com/feed/';

UPDATE public.news_sources
SET feed_url = 'https://dailytrust.com/tag/electricity/feed/', filter_by_keywords = false,
    notes = 'Electricity tag feed (the main feed rarely carried power stories).'
WHERE feed_url = 'https://dailytrust.com/feed/';

UPDATE public.news_sources
SET feed_url = 'https://www.premiumtimesng.com/tag/electricity/feed', filter_by_keywords = false,
    notes = 'Electricity tag feed (the main feed rarely carried power stories).'
WHERE feed_url = 'https://www.premiumtimesng.com/feed';

UPDATE public.news_sources
SET feed_url = 'https://businessday.ng/category/energy/feed/', filter_by_keywords = true,
    notes = 'Energy section feed; keyword filter on because it also covers oil and gas.'
WHERE feed_url = 'https://businessday.ng/feed/';

UPDATE public.news_sources
SET feed_url = 'https://nairametrics.com/category/energy/feed/', filter_by_keywords = true,
    notes = 'Energy section feed; keyword filter on because it also covers oil and gas.'
WHERE feed_url = 'https://nairametrics.com/feed/';

INSERT INTO public.news_sources (name, feed_url, region, filter_by_keywords, is_active, notes)
VALUES ('Premium Times (NERC)', 'https://www.premiumtimesng.com/tag/nerc/feed', 'LOCAL', false, true,
        'Stories Premium Times tags with NERC: regulator decisions, metering and market reports.')
ON CONFLICT (feed_url) DO NOTHING;
