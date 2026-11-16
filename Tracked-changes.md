# Tracked Changes — Excredite Electricity Data Hub (EPDH)

This file records every change made to the project, newest first. It covers the earlier history (rebuilt from the git log) and everything after it. Claude adds an entry with every change (see `CLAUDE.md`), and people making changes by hand should add one too.

**Entry format:**
- date · branch · PR · status;
- what changed and why;
- files touched;
- manual steps (SQL to run, environment variables, settings);
- how it was tested.

**Status values:**
- **Open:** in a pull request that hasn't merged yet.
- **Merged:** in `main`.
- **Committed:** pushed straight to `main`, without a PR.

---

## 2026-11-16 · Scrollable filter panel on News & Updates
**Branch:** `dev` · **PR:** pending · **Status:** Open

**What and why:** On shorter screens the filter rail ran off the bottom of the window. It had no height limit, so the sources list, the last-pull line and Reset filters couldn't be reached. The drawer did scroll, but on macOS its scrollbar was hidden until you scrolled, so it didn't look scrollable.

**Changes:**
- **Layout:** the toolbar now stays fixed at the top of the page. Below it, the news list and the filter rail each scroll on their own and fill exactly the space left, so the rail never runs off-screen and filters stay in view while you scroll the stories.
- **New `.scroll-panel` style** in `globals.css`, used on the rail, the list and the drawer body:
  - a slim grey scrollbar that stays visible;
  - space reserved for it, so content doesn't shift when it appears;
  - scrolling at the end of a panel doesn't carry on into the page behind it.
- **Bug fixes found while testing:**
  - The day groups in the list were shrinking to fit and clipping stories. They now keep their natural height.
  - The hidden "opens in a new tab" screen-reader text escaped the scrolling list and made the whole page scrollable. The list now contains it.

**Files:** `frontend/app/news/page.tsx`, `frontend/app/globals.css`, `Tracked-changes.md` (PR #6 entry marked Merged)

**Manual steps:** none.

**Tested:**
- Checked in Chromium with 16 sources and 30 stories, at three sizes:
  - **1440×700:** the rail fits on screen (102–660px) and scrolls its 1,082px of content, with Reset filters reachable. The list scrolls 3,129px of stories inside 558px. The page itself doesn't scroll, so the toolbar stays put.
  - **1024×600:** the drawer body scrolls and its footer buttons stay on screen.
  - **390×844:** the list scrolls within the screen.
- 144 out of 144 tests pass, lint is clean and the production build passes.

---

## 2026-11-16 · News & Updates redesigned as an "Analyst Feed" (design B)
**Branch:** `dev` · **PR:** #6 · **Status:** Merged

**What and why:** The owner picked design B, a dense, filterable timeline, from three concepts on the design canvas. The filter panel is placed to work alongside the existing 256px app sidebar.

**Layout:**
- **Toolbar (everyday filters):**
  - Nigeria / International / All;
  - time range: 24 hours, 7 days (the default), 30 days or all time;
  - search;
  - **Refresh feeds**.
- **News list:** grouped by day ("Today", "Yesterday", then "Friday 13 November"). Each story is one compact row: time, headline linking to the article, one-line summary, source, region, up to two topic tags, and the anomaly badge where linked. "Load earlier stories" fetches 30 at a time.
- **Filters panel (topics, sources, feed status):**
  - Sits on the **right** of the list from 1280px wide, so it never stacks beside the app sidebar.
  - Narrower screens get a **Filters** button with a count of active filters. It opens a right-hand drawer with the time range, topics and sources, plus Reset and "Show N stories". The drawer closes with Escape or by clicking outside, and keyboard focus returns to the button.
  - Shows each source with a green or orange dot and "not reached" if its last pull failed, the time of the last pull, and the next hourly pull. If the hourly job has no app address yet, it says automatic pulls start once the app is connected.
  - Ticking every topic or source counts as no filter, so stories without tags still show.
- **Removed:** article thumbnails, which the dense design drops. Feed images are still stored in `image_url`.

**Topics:**
- **Tagging:** new `utils/news/topics.ts` tags each article when it's ingested, using whole-word keywords. The tags are Regulation & tariffs, Grid & transmission, Generation & gas, Distribution & metering, Renewables & storage, and Other for articles that match none. An article can have several. Quantities like "330kV" and "15,000 MVA" count as grid.
- **Database:** `10_news_topics.sql` adds `news_articles.topics text[]`, a constraint limiting it to those six values, and a GIN index for the topic filter. **Applied to the live Supabase project**, before any code that writes the column. It had 0 articles, so nothing needed backfilling. The security advisor reports nothing new.

**Files:**
- `10_news_topics.sql` (new)
- `frontend/utils/news/topics.ts` (new), `frontend/utils/news/feedView.ts` (new: time ranges, day grouping, clock format, filter count, feed status, next pull)
- `frontend/app/news/FilterPanel.tsx` (new), `frontend/app/news/page.tsx` (rewritten)
- `frontend/utils/news/ingest.ts` (writes `topics`)
- `frontend/utils/news/__tests__/topics.test.ts` (new), `feedView.test.ts` (new), `ingest.test.ts`
- `frontend/vitest.config.ts` (tests run in UTC)
- `README.md` (SQL run order), `Tracked-changes.md` (PR #5 entries marked Merged)

**Manual steps:** none for this project. `10_news_topics.sql` is already applied. Run it on any other environment before deploying this code.

**Tested:**
- 144 out of 144 tests pass, 32 of them new: topic tagging (whole words, multiple topics, the database-allowed values), day grouping across midnight and years, time windows, filter counts, feed status and next-pull times.
- Lint is clean and the production build passes.
- Rendered as a signed-in non-admin at three widths. At 1440px the rail shows and the Filters button is hidden; at 1024px it's the reverse; at 390px everything stacks.
- In the drawer, choosing "Last 24 hours" and unticking "Other" produced the correct database query (`published_at >= …` and `topics && {…}`) and a badge of 2.
- Escape closes the drawer and returns focus.
- With no articles, the empty state appears.

---

## 2026-11-16 · Database security hardening (Supabase advisor findings)
**Branch:** `dev` · **PR:** #5 · **Status:** Merged

**What and why:** Fixed every security warning the Supabase advisor reported that SQL can fix: 22 in all, none caused by the news work. Applied to the live Supabase project with the owner's approval, and saved as `09_security_hardening.sql`.

| Finding | Fix |
|---|---|
| `get_user_role()` callable by anyone at `/rest/v1/rpc/get_user_role`, with no fixed `search_path` | Moved to a new `private` schema that the API doesn't expose, with `search_path` fixed. Signed-in users keep `EXECUTE`, because all 34 access policies call it, and those policies kept working unchanged. Anonymous users can no longer reach it. |
| `handle_new_user()` (signup trigger) callable through the API, with no fixed `search_path` | `EXECUTE` revoked from `PUBLIC`, `anon` and `authenticated`, and `search_path` fixed. The trigger still fires: Postgres doesn't check `EXECUTE` when firing a trigger, which was confirmed with a test inside a rolled-back transaction. |
| `rls_auto_enable()` (Supabase event trigger that turns on RLS for new tables) callable through the API | `EXECUTE` revoked. |
| 16 partition tables (`generation_output_*`, `gas_supply_*`, `transmission_data_*`, `distribution_performance_*`) had RLS on but no policies | Each partition now has its parent's policies: any signed-in user can read, and admin, app and ingestion roles can insert. Signed-in users can now read a partition directly, but it's the same data they already see through the parent table. |
| `pg_trgm` extension in the `public` schema | Moved to `extensions`. No indexes or app code use it, and `extensions` is on the default search path. |

**Not fixable in SQL:** leaked-password protection is a dashboard setting, and requires a paid Supabase plan.

**Files:**
- `09_security_hardening.sql` (new)
- `README.md` (full SQL run order and the dashboard step)
- `CLAUDE.md` (new database conventions: use `private.get_user_role()`, rules for new `SECURITY DEFINER` functions, run the advisor after schema changes)

**Manual steps:** in the Supabase dashboard, turn on **Authentication → Sign In / Providers → Email → Prevent use of leaked passwords**.

**Tested:**
- Before and after the change, simulated a signed-in admin, a signed-in non-admin and an anonymous visitor inside rolled-back transactions. Admin and non-admin saw identical counts on every table both times: profiles, plants, 87,763 generation rows, feeds, documents, matters and settings.
- After the change, anonymous users are refused the `private` schema.
- The trigger test confirmed a trigger fires after `EXECUTE` is revoked, and left nothing behind.
- The security advisor now reports only leaked-password protection, down from 22 warnings.

---

## 2026-11-15 · Hourly news schedule switched on; refresh for every user
**Branch:** `dev` · **PR:** #5 · **Status:** Merged

**What and why:** News should update hourly, and anyone, not only admins, should be able to pull the latest on demand.

**Live database** (applied to the Supabase project with the owner's approval):
- Applied `07_news_ingestion.sql`. It hadn't been run before, so the news table had no RSS columns and no feeds; 21 feeds are now stored, 16 active.
- New `08_news_schedule.sql`, also applied:
  - switches on `pg_cron` and `pg_net`;
  - generates a random cron secret inside the database and stores it encrypted in Supabase Vault, so it never appears in the job, the code or chat;
  - adds the function `epdh_trigger_news_ingest()`, which can't be called through the API (EXECUTE revoked from `anon` and `authenticated`);
  - schedules the hourly job `epdh-ingest-news-hourly` (`7 * * * *`).
- The job reads the app's address from `system_settings.news_ingest_url`. That's empty because the app isn't deployed yet, so the job currently runs and does nothing.
- Verified: the job is active, the secret exists (its value wasn't read), the function isn't exposed, a dry run made no request, and the Supabase security advisor flags nothing new.

**App:**
- **Who can refresh:** `/api/news/ingest` now accepts any active signed-in user, not just admins.
  - A signed-in user must use `POST`, so a browser prefetch (`GET`) can never start a pull.
  - Manual refreshes share one 5-minute cool-down across all users. Extra clicks get HTTP 429 with how long to wait.
  - The cool-down is claimed with a single conditional UPDATE, so two simultaneous clicks can't both start a pull.
  - Scheduled runs skip the cool-down but record their start time, so a click right after a scheduled pull is throttled.
  - Manual refreshes are written to `user_activity_log` as `NEWS_REFRESH`.
- **News page:** the **Refresh feeds** button now shows for every signed-in user, and the page text says news updates hourly.
- **Overview:** a new refresh icon on the "Latest news" tile. It spins while working, shows the result or the wait time, and reloads the two headlines.
- **Shared messages:** both controls use `utils/news/refreshClient.ts`, so their wording is identical. It covers new articles, unreachable sources, the cool-down, an expired sign-in, server errors and offline.

**Files:**
- `08_news_schedule.sql` (new)
- `07_news_ingestion.sql` (optional block now points to 08)
- `frontend/utils/news/cooldown.ts` (new), `frontend/utils/news/refreshClient.ts` (new)
- `frontend/app/api/news/ingest/route.ts`, `frontend/app/news/page.tsx`, `frontend/app/page.tsx`
- `frontend/utils/news/__tests__/cooldown.test.ts` (new), `refreshClient.test.ts` (new)
- `README.md`, `Tracked-changes.md` (PR #4 entries marked Merged)

**Manual steps** (once the app is deployed):
1. `UPDATE public.system_settings SET value = 'https://<your-app-domain>' WHERE key = 'news_ingest_url';`
2. Copy the secret from `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'epdh_cron_secret';` into the app's `CRON_SECRET`.
3. Check runs with `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`.

**Tested:**
- 112 out of 112 tests pass, 25 of them new. They cover claims, refusals, two simultaneous clicks, a missing row, repairing bad values, sub-second waits, a missing table, every refresh message, the 429 fallback header, a 504 HTML page and offline.
- Confirmed on the live database that comparing ISO timestamps as text orders correctly under its `en_US.UTF-8` collation.
- Lint is clean and the production build passes.
- Both controls rendered in Chromium as a non-admin user, showing the cool-down message.

---

## 2026-11-15 · Edge-case tests for RSS news pulling, and the fixes they led to
**Branch:** `dev` · **PR:** #4 · **Status:** Merged

**What and why:** Added the project's first automated test suite: 87 tests covering the RSS parser, the electricity filter, the ingester and the cron-secret check. Writing them turned up 11 real problems, which are now fixed.

**Parser (`rss.ts`):**
1. **Relative links:** links like `/news/a` caused the article to be dropped. They're now resolved against the feed's address, and images the same way.
2. **Null bytes:** a NUL byte in any item made PostgreSQL reject that feed's *whole* batch. Control characters are now stripped.
3. **Cut-off emoji:** truncating a title or summary could split an emoji into half a character, which the database also rejects. Truncation now counts whole characters.
4. **Future dates:** items dated in the future (publisher time-zone mistakes) would have stayed pinned at the top of the page. Dates more than 10 minutes ahead are now clamped to the current time.
5. **Double-encoded characters:** titles showed text like `&amp;`. Entities are now decoded twice.
6. **Tracking tags:** `utm_*`, `fbclid` and `#fragment` made the same article look like a different URL, so it was stored twice. They're now stripped before de-duplication.
7. **Stray spaces:** removing HTML tags left gaps such as "restored ." These are now tidied.

**Filter (`relevance.ts`):**
8. Numbers written straight against units ("500MW", "4,000MWh", "330kV", "15,000 MVA") weren't recognised, so relevant stories were dropped. Fixed, and "MVA" and "kV" added as keywords.

**Ingester (`ingest.ts`):**
9. **Time limit:** 16 feeds, five at a time, with 15 s each could reach the route's 60 s limit and be killed part-way. The run now has a 50 s budget: per-feed timeouts shrink as time runs out, and feeds it can't reach are reported as "Skipped".
10. **Size limit:** the 5 MB limit was checked only after the whole feed was in memory. It now stops reading as soon as the limit is passed, or before downloading if `Content-Length` is already too big.
11. **Text encoding:** feeds in ISO-8859-1 or Windows-1252 came out garbled. The encoding is now read from the `Content-Type` header or the XML declaration.

Also: database writes now go in batches of 100 rows. The cron-secret check moved into `utils/news/auth.ts` so it can be tested; its behaviour is unchanged.

**Already handled, now covered by tests:**
- an entity-expansion attack ("billion laughs");
- external-entity tricks (XXE);
- truncated XML;
- bot-check HTML pages served as 200;
- `javascript:` and `data:` links;
- Atom `rel="self"` links;
- single-item and empty feeds;
- byte-order marks;
- HTTP errors, DNS failures and timeouts, each isolated to one feed;
- a re-run inserting nothing new;
- the cron secret: unset, empty, wrong, a prefix of the right value, wrong case.

**Files:**
- `frontend/utils/news/rss.ts`, `relevance.ts`, `ingest.ts`
- `frontend/utils/news/auth.ts` (new)
- `frontend/app/api/news/ingest/route.ts`
- `frontend/utils/news/__tests__/*.test.ts` (new, 4 files)
- `frontend/vitest.config.ts` (new)
- `frontend/package.json` (adds `vitest` and an `npm test` script) and `package-lock.json`
- `README.md`

**Manual steps:** none. Run the tests with `npm test` in `frontend/`.

**Tested:**
- 87 out of 87 tests pass.
- The same tests run against the code from before the fixes fail 14 times, so they do catch these bugs.
- Live run against 6 real feeds: Energy-Storage.news wrote 106 articles in two batches, a broken feed was isolated, and a second run inserted 0.
- Lint is clean and the production build passes.

---

## 2026-11-15 · Automatic electricity news from RSS feeds
**Branch:** `dev` · **PR:** #4 · **Status:** Merged

**What and why:** The News & Updates page now fills itself from RSS feeds of Nigerian outlets and international power-sector trade press. Before this change it showed hard-coded sample articles.
- **Sources:** a new `news_sources` table holds the feed list. 21 feeds are seeded: 12 local and 9 foreign, with 16 active. Five are seeded inactive because they blocked or failed requests from a cloud server during testing; they can be switched on to try from Vercel.
- **Ingester (`/api/news/ingest`):**
  - fetches every active feed, five at a time, with a 15-second timeout each;
  - reads RSS 2.0, RSS 1.0 and Atom formats;
  - keeps only the last 30 days of items;
  - saves each article's title, a short summary (up to 500 characters), link, image, date, source and region (local or foreign);
  - never stores full article text;
  - can only be called by a scheduler holding `CRON_SECRET` or by a signed-in admin.
- **Electricity filter:** general news sites (Punch, Vanguard, ThisDay and others) keep only stories that match electricity keywords, such as NERC, DisCo, grid, megawatt and the plant names. Bare "power", "tariff" and "outage" are not keywords, because they catch politics, trade and telecom stories. Energy-specific feeds keep every item.
- **No duplicates:** a unique index on `news_articles.url` means a re-run never stores the same article twice. Each feed's last result and error are recorded on its `news_sources` row.
- **Schedule:** Vercel Cron runs daily at 05:17 UTC (`vercel.json`). An optional hourly schedule through Supabase `pg_cron` is included in the SQL file.
- **News & Updates page:**
  - real data only; the sample articles are gone;
  - Nigeria / International / All tabs, a source filter (previously defined but never shown) and server-side search;
  - "Load more" in pages of 30, thumbnails where the feed provides an image, and an "Anomaly flagged" badge driven by `anomaly_alerts.news_id`;
  - a "Refresh feeds" button for admins;
  - clear messages when there's no news yet or when nothing matches the filters.

**Files:**
- `07_news_ingestion.sql` (new)
- `frontend/utils/news/rss.ts` (new)
- `frontend/utils/news/relevance.ts` (new)
- `frontend/utils/news/ingest.ts` (new)
- `frontend/app/api/news/ingest/route.ts` (new)
- `frontend/vercel.json` (new)
- `frontend/app/news/page.tsx`
- `frontend/package.json` and `package-lock.json` (adds `fast-xml-parser`)
- `README.md`, `CLAUDE.md`, `Tracked-changes.md`

**Manual steps:**
1. Run `07_news_ingestion.sql` in the Supabase SQL Editor.
2. In Vercel, set `CRON_SECRET` to a long random string, and make sure `SUPABASE_SERVICE_ROLE_KEY` is set. `vercel.json` sits in `frontend/`, which assumes the Vercel project's Root Directory is `frontend`.
3. Optional, for hourly updates: enable `pg_cron` and `pg_net`, then run the commented block at the end of the SQL file with your domain and secret filled in.
4. Sign in as an admin and click **Refresh feeds** on News & Updates for the first pull.

**Tested:**
- Parser and filter run against all 17 candidate feeds live. Feeds parsed correctly, and the filter kept power-sector stories and dropped crime and politics.
- End-to-end run of the ingester with a stand-in database: articles saved, a second run saved 0 duplicates, and a broken feed was recorded as an error without stopping the rest.
- Production build and lint pass.
- News page rendered in Chromium with sample rows.
- Not yet run against the real Supabase project.

---

## 2026-11-15 · `Tracked-changes.md` change log
**Branch:** `dev` · **PR:** #4 · **Status:** Merged

**What and why:** Added this file to record every change to the project, past and future. `CLAUDE.md` now requires Claude to add an entry with every change.

**Files:** `Tracked-changes.md` (new), `CLAUDE.md`

---

## 2026-11-15 · Single shared branch for Claude's work (`CLAUDE.md`)
**Branch:** `dev` · **PR:** #3 · **Status:** Merged

**What and why:** Claude sessions in VS Code, the CLI and the web were each creating their own branch and PR. `CLAUDE.md` now tells Claude to:
- work only on `dev`;
- reset `dev` to `main` after each merge;
- keep at most one open PR from `dev` into `main`.

Also deleted the leftover `claude/fervent-archimedes-55u8ic` branch. GitHub refused this session's attempt to delete the remote `feature/bento-redesign` and `chore/windows-dev-scripts-remove-forecasts` branches. Both are fully merged, so they're safe to delete by hand.

**Files:** `CLAUDE.md` (new)

---

## 2026-11-15 · Remove Forecasts from the sidebar and admin permissions
**Branch:** `chore/windows-dev-scripts-remove-forecasts`, moved to `dev` · **PR:** #3 · **Status:** Merged
*(Made in a Claude session in VS Code.)*

**What and why:** Removed the Forecasts entry from the sidebar and from the admin panel's list of permission modules.

**Files:** `frontend/app/admin/page.tsx`, `frontend/app/components/Sidebar.tsx`

---

## 2026-11-15 · Make npm scripts work on Windows, and delete the Forecasts page
**Branch:** `chore/windows-dev-scripts-remove-forecasts`, moved to `dev` · **PR:** #3 · **Status:** Merged
*(Made in a Claude session in VS Code.)*

**What and why:**
- The `dev`, `build` and `start` scripts used the Unix-only `NODE_OPTIONS='…'` syntax. They now call `node --max-old-space-size=8192 node_modules/next/dist/bin/next …`, which works on Windows, macOS and Linux.
- Deleted the Forecasts page, which only showed synthetic chart data.

**Files:** `frontend/package.json`, `frontend/app/forecasts/page.tsx` (deleted)

---

## 2026-11-15 · Bento redesign and Overview dashboard
**Branch:** `feature/bento-redesign` · **PR:** #2 · **Status:** Merged

**What and why:** Picked from five design concepts.
- **Colours:** the Excredite logo's colours replace the old gold `#b58e23`:
  - forest green `#0A3A22` for the main colour;
  - amber `#FFA100` for highlights;
  - a pale green-grey background.
- **All pages:** Tailwind's gray and slate scales and the card corner sizes were retinted in `globals.css`, so every page adopted the new look without code changes.
- **App layout:** the sidebar and the page content now sit as rounded panels.
- **Sidebar:**
  - cropped logo images;
  - green highlight for the current page, with an amber icon;
  - amber alert badge;
  - new Overview link;
  - hidden on all sign-in pages, not just `/login`.
- **Overview page (`/`):** a new dashboard with live Supabase tiles:
  - daily generation for the latest 14 days in the database, with anomaly days in amber;
  - installed capacity;
  - open alerts;
  - next matter deadlines;
  - document processing status;
  - latest news.

  Its quick-question box hands the question to `/query?q=…`, which sends it automatically.
- **Other:** sign-in pages use the logo instead of an overflowing "EPDH" badge. The forecast chart and remaining hard-coded colours moved to the new palette.

**Files:**
- `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`
- `frontend/app/components/Sidebar.tsx`, `frontend/app/query/page.tsx`
- the four sign-in pages
- `documents/page.tsx`, `forecasts/page.tsx`, `profile/page.tsx`
- `frontend/public/excredite-wordmark.png` (new), `frontend/public/excredite-mark.png` (new)

**Tested:**
- Production build passes.
- Rendered in Chromium at 1440 px and 390 px with stand-in Supabase data.
- Not yet checked against the real database.

---

## 2026-11-12 · Load the Inter and JetBrains Mono fonts
**Branch:** `claude/fervent-archimedes-55u8ic` · **PR:** #1 (closed) → #2 · **Status:** Merged

**What and why:** The CSS named Inter but never loaded it, so most users saw a system font. Inter (for text) and JetBrains Mono (for code and `font-mono`) are now loaded with `next/font`, bundled at build time and served from the app itself.

**Files:** `frontend/app/layout.tsx`, `frontend/app/globals.css`

**Tested:** Production build passed, and the browser confirmed both fonts load.

---

## Earlier history (before the change log; rebuilt from git)

### 2026-08-14 · Document processing pipeline and saved chat sessions
`6e58dfb` · Committed
- **Document processing:**
  - text is extracted from PDF, Word, PowerPoint and Excel files (`utils/documentProcessor.ts`);
  - it's split into chunks and embedded with Gemini;
  - chunks are stored in `embeddings` using pgvector (`06_document_embeddings_setup.sql`).
- **Document API routes:** fetch or delete a document, download it, ask questions about it, bulk delete, and process.
- **AI chat:** can search uploaded documents, and conversations are saved in the browser.

**Files:** `06_document_embeddings_setup.sql`, `frontend/app/api/documents/*`, `frontend/utils/documentProcessor.ts`, `frontend/app/api/chat/route.ts`, `documents/page.tsx`, `query/page.tsx`, `history/page.tsx`, `next.config.ts`, `package.json`

### 2026-07-22 · Matters renamed to engagements; regulatory fields; deadline tracking
`e77c11a` · Committed
- Matters became "engagements", with regulatory data fields and deadline-tracking UI.
- Added role display names (`utils/roles.ts`).

**Files:** `admin`, `alerts`, `matters` and `profile` pages; `Sidebar.tsx`; `utils/roles.ts` (new)

### 2026-07-19 · AI document editing, tab URLs and role-based access
`792d26a` · Committed
- AI-assisted document editing.
- The Documents page's tabs are reflected in the URL (`?tab=`).
- Role-based access control across the main pages.

**Files:** `alerts`, `documents`, `history`, `matters`, `news` and `query` pages; `Sidebar.tsx`

### 2026-07-15 · Legal matters linked to document uploads; seed cases
`9ebc48c` · Committed
- Documents can be linked to legal matters.
- Seeded 3 matters (`05_db_updates.sql`) and fixed a name typo (`04_name_fix.sql`).
- Added the document edit API.
- Merged the Briefing Notes page into Documents.

**Files:** `04_name_fix.sql`, `05_db_updates.sql`, `frontend/app/api/documents/edit/route.ts` (new), `frontend/app/briefing/page.tsx` (deleted), and several pages

### 2026-07-13 · Sign-up, password reset and admin user management
`a98889e` · Committed
- Sign-up, forgot-password and reset-password pages.
- Admin user-management API.
- Document upload API.
- News page created (it showed sample data at the time).
- Database: settings, activity log, per-document access and news tables, plus wider anomaly alerts and their access rules (`03_epdh_updates.sql`).

**Files:** `03_epdh_updates.sql`, `frontend/app/api/admin/users/route.ts`, `frontend/app/api/documents/upload/route.ts`, `frontend/app/news/page.tsx`, the sign-in pages, and others

### 2026-07-11 · Admin dashboard and AI chat route
`76b4c25` · Committed
- Admin page for user management and role permissions.
- The AI chat API route (`api/chat/route.ts`).

**Files:** `frontend/app/admin/page.tsx` (new), `frontend/app/api/chat/route.ts` (new), `Sidebar.tsx`, `query/page.tsx`, `package.json`

### 2026-06-01 · NESI operational data archive
`282788c` · Committed
- Added `NESI_CSV.zip`: 110 monthly CSVs of grid operational data from 2014 onward.

### 2026-05-16 · First frontend build and document management screen
`99c65b0` · Committed
- Built out the first version of the Next.js frontend pages.
- Added the Not Found page.

### 2026-05-11 to 2026-05-15 · Project start
`820c121`, `10fe367`, `cdb48e5`, `66fad8a` · Committed / merged
- First upload of the project:
  - database schema and access rules (`schema.sql`, `01_supabase_backend_setup.sql`);
  - seed data (`02_seed_data.sql`);
  - technical documentation and the first Next.js frontend.
