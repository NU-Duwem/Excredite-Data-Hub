# EPDH Build Log — Session 1

**Date:** 11 May 2026  
**Objective:** Deploy database schema to Supabase + configure backend + seed data  
**Status:** ✅ Schema deployed. Backend setup + seed data files created, ready to run.

---

## What Was Done

### Phase 1: Schema Deployment to Supabase

The original `schema.sql` was a `pg_dump` export from a local PostgreSQL 18 + TimescaleDB environment. It contained several Supabase-incompatible elements that caused errors when run in the Supabase SQL Editor. Each was identified and fixed:

| # | Error | Cause | Fix Applied |
|---|-------|-------|-------------|
| 1 | `syntax error at or near "\"` on line 5 | `\restrict` / `\unrestrict` — Supabase-specific `psql` meta-commands injected by the dump tool. Not valid SQL. | Removed both lines (line 5 and line 1489). |
| 2 | `extension "timescaledb" is not available` | TimescaleDB is not installed on the Supabase PostgreSQL instance. | Removed `CREATE EXTENSION timescaledb` and its `COMMENT`. The schema uses native PostgreSQL `PARTITION BY RANGE` — TimescaleDB was never actually needed. |
| 3 | `role "power_app" does not exist` | `GRANT` statements at the end of the dump referenced 5 roles (`power_app`, `power_analyst`, `power_ingestion`, `power_ceo`, `power_team`) that existed on the local instance but not on Supabase. | Removed all 15 `GRANT` statements. Replaced with a comment preserving the original role names for future reference. |
| 4 | `relation "anomaly_alerts" already exists` | Previous partial run had created some tables before failing on the role error. | Added 16 `DROP TABLE IF EXISTS ... CASCADE` statements at the top of the file, making the script idempotent (safe to re-run). |

**Result:** Schema deployed successfully. All 16 tables, partition sub-tables, constraints, indexes, and foreign keys created.

### Phase 2: Supabase Backend Configuration

Created `01_supabase_backend_setup.sql` with the following components:

#### 2a. User Profiles Table
```sql
public.user_profiles
```
- Maps Supabase Auth users to EPDH roles
- Columns: `id` (references `auth.users`), `email`, `full_name`, `role`, `is_active`
- Role constraint enforces valid values: `power_admin`, `power_ceo`, `power_app`, `power_analyst`, `power_ingestion`, `power_team`, `power_ai`, `power_legal`
- Default role: `power_team`

#### 2b. Auto-Profile Trigger
- Function `handle_new_user()` fires after every new Supabase Auth signup
- Automatically creates a `user_profiles` row with role from signup metadata (or defaults to `power_team`)

#### 2c. Role Helper Function
```sql
public.get_user_role() → text
```
- `SECURITY DEFINER` function that returns the current authenticated user's EPDH role
- Used by all RLS policies to make access decisions

#### 2d. Row Level Security (RLS)

RLS enabled on all 17 tables. Policy design follows the PRD's access control model:

| Table Group | SELECT | INSERT/UPDATE |
|-------------|--------|---------------|
| Reference tables (states, organisations, power_plants) | All authenticated users | power_admin, power_app, power_ingestion |
| Time-series tables (generation, gas, transmission, distribution) | All authenticated users | power_admin, power_app, power_ingestion |
| Tariff tables | All authenticated users | power_admin, power_app, power_ingestion |
| Regulatory actions | All authenticated users | power_admin, power_app, power_ingestion |
| **Matters** (legal) | **power_admin, power_ceo, power_legal, power_app only** | power_admin, power_app |
| **Documents** | PUBLIC/INTERNAL → all; **LEGAL_PRIVILEGED → power_admin, power_ceo, power_legal only** | power_admin, power_app, power_ingestion |
| Embeddings | power_admin, power_app, power_ai | power_admin, power_app, power_ai |
| AI artifact tables (conversation_log, anomaly_alerts, forecasts) | All authenticated users | power_admin, power_app, power_ai |
| User profiles | Own profile only (admins see all) | Own profile only |

#### 2e. Storage Buckets

| Bucket | Purpose | Max File Size | Access |
|--------|---------|---------------|--------|
| `documents` | Regulatory records, legal documents | 50 MB | Read: all authenticated. Write: admin, app, ingestion. |
| `ingestion-staging` | Raw data files (auto-cleanup) | 100 MB | Read/Write: admin, ingestion only. |
| `exports` | AI briefing notes, client reports | 50 MB | Read: all authenticated. Write: admin, app, AI. |

### Phase 3: Seed Data

Created `02_seed_data.sql` with real Nigerian power sector data:

#### 3a. States — 37 rows
All 36 Nigerian states + FCT with 2-character codes and geopolitical zones.

#### 3b. Organisations — 28 rows

| Type | Count | Entities |
|------|-------|----------|
| NERC | 1 | Nigerian Electricity Regulatory Commission |
| NEMSA | 1 | Nigerian Electricity Management Services Agency |
| TCN | 1 | Transmission Company of Nigeria |
| NBET | 1 | Nigerian Bulk Electricity Trading Plc |
| GENCO | 7 | Egbin, Transcorp, Sapele, Afam, Geregu, Mainstream (Kainji/Jebba), North South Power (Shiroro) |
| DISCO | 11 | AEDC, BEDC, EKEDC, EEDC, IBEDC, IE, JED, KAEDCO, KEDCO, PHED, YEDC |
| IPP | 4 | Azura, NDPHC, Agip/NAOC, Shell/SPDC |
| OTHER | 2 | NNPC, NGC (gas suppliers) |

#### 3c. Power Plants — 18 rows

| Category | Count | Total Capacity |
|----------|-------|----------------|
| Hydro | 3 | ~1,938 MW (Kainji, Jebba, Shiroro) |
| GENCO Thermal | 5 | ~4,522 MW (Egbin, Ughelli, Sapele, Afam IV-V, Geregu) |
| IPP Thermal | 3 | ~1,591 MW (Azura, Afam VI, Okpai) |
| NIPP Thermal | 7 | ~3,350 MW (Alaoji, Calabar, Gbarain, Ihovbor, Olorunsogo II, Omotosho II, Geregu II) |
| **Total** | **18** | **~11,401 MW** |

All power plants are linked to their owning organisation and gas supplier (NGC for thermal plants) via foreign keys.

---

## Files Created / Modified

| File | Action | Purpose |
|------|--------|---------|
| `schema.sql` | Modified | Fixed 4 Supabase compatibility issues. Added DROP preamble for idempotency. |
| `01_supabase_backend_setup.sql` | Created | User profiles, RLS policies, storage buckets, triggers, helper functions. |
| `02_seed_data.sql` | Created | 37 states, 28 organisations, 18 power plants. |

---

## Execution Order

Run these in the **Supabase SQL Editor** in this exact order:

1. **`schema.sql`** — Creates all tables, partitions, constraints, indexes, foreign keys ✅ *Already run*
2. **`01_supabase_backend_setup.sql`** — Backend config (user_profiles, RLS, storage) ⏳ *Ready to run*
3. **`02_seed_data.sql`** — Seed data (states, organisations, power plants) ⏳ *Ready to run*

---

## Verification Queries

After running all three files, confirm with:

```sql
-- 1. Count states
SELECT COUNT(*) AS total_states FROM states;
-- Expected: 37

-- 2. Count organisations by type
SELECT org_type, COUNT(*) FROM organisations GROUP BY org_type ORDER BY org_type;
-- Expected: DISCO=11, GENCO=7, IPP=4, NBET=1, NEMSA=1, NERC=1, OTHER=2, TCN=1

-- 3. Count power plants by type with total capacity
SELECT plant_type, COUNT(*), SUM(installed_capacity_mw) AS total_mw
FROM power_plants GROUP BY plant_type;

-- 4. List all plants with owners
SELECT pp.name, pp.installed_capacity_mw, o.short_name AS owner, pp.plant_type
FROM power_plants pp
JOIN organisations o ON pp.owner_id = o.id
ORDER BY pp.installed_capacity_mw DESC;

-- 5. Confirm RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;

-- 6. Confirm storage buckets
SELECT id, name, public FROM storage.buckets;
```

---

## What's Next

| Step | Task | Description |
|------|------|-------------|
| **3** | Next.js project setup | Init Next.js app, install `@supabase/supabase-js`, configure environment variables |
| **4** | Auth flow | Supabase Auth login/signup, role-based route protection, middleware |
| **5** | Dashboard pages | National Grid KPI, Tariff Analytics, Regulatory Tracker, Executive Summary, Legal Matters Monitor |
| **6** | Data ingestion | Manual TCN report processing script, then Airflow/Edge Function automation |
| **7** | AI layer | LangChain + Claude for NL querying, anomaly detection, forecasting, briefing notes |

---

## Key Design Decisions

1. **TimescaleDB removed** — The schema already uses native PostgreSQL range partitioning (`PARTITION BY RANGE`). TimescaleDB hypertables were referenced in the PRD but never actually implemented in the schema. Native partitioning is sufficient and works on Supabase without extensions.

2. **Database roles → Supabase Auth + RLS** — The PRD defined 8 database roles (`power_admin` through `power_legal`). On Supabase, these are implemented as values in the `user_profiles.role` column, enforced through RLS policies using `get_user_role()`, rather than as PostgreSQL roles with `GRANT` statements.

3. **Classification-based document access** — Documents with `LEGAL_PRIVILEGED` classification are only visible to `power_admin`, `power_ceo`, and `power_legal` roles. PUBLIC and INTERNAL documents are visible to all authenticated users.

4. **Service role key for admin ops** — Supabase's `service_role` key bypasses RLS entirely. Server-side admin operations (data ingestion, bulk updates) should use this key. The RLS policies primarily govern access through the Supabase client in the Next.js frontend.

---

*Session 1 complete. Schema deployed, backend configured, seed data prepared.*

---
---

# EPDH Build Log — Session 2

**Date:** 11 May 2026  
**Objective:** Frontend Scaffolding, Native Binary Fixes, and Authentication Connection  
**Status:** ✅ Frontend UI complete. NPM Windows binary issues resolved. Supabase connected.

## What Was Done

### Phase 1: Frontend Initialization & Styling Setup
- Initialized Next.js 16 with Tailwind CSS v4 and React 19.
- Cleaned default `globals.css` to match the exact aesthetic requirements of the PRD:
  - Neutral/professional palette: Light grey (`#f9fafb`) backgrounds, dark text (`#111827`), and muted blue accents (`#3b82f6`).
  - Implemented the `Inter` sans-serif font across the entire application for analytical readability.
- Created `app/layout.tsx` to handle the global structure, including a desktop sidebar and a mobile-responsive top bar.
- Extracted the Sidebar into a Client Component (`app/components/Sidebar.tsx`) that conditionally hides itself on the `/login` route.

### Phase 2: Resolving Windows Native Dependency Errors
- Encountered severe network throttling/antivirus interference during the initial `npm install`, causing the native Node binaries to download as corrupted 0-byte files.
- Diagnosed hydration mismatches (`data-my-extension="installed"`) caused by browser extensions injecting into the DOM before React loaded. Fixed by adding `suppressHydrationWarning` to the `<html>` and `<body>` tags.
- Fixed `Next.js SWC Compiler` native binding failure by forcing Webpack as a fallback (`next dev --webpack`) and explicitly force-installing the corrupted modules:
  - `@next/swc-win32-x64-msvc`
  - `lightningcss-win32-x64-msvc`
  - `@tailwindcss/oxide-win32-x64-msvc`

### Phase 3: UI Scaffolding & Layout Implementation
Built out the complete visual interface for all application routes to prevent 404 errors, strictly following the PRD requirements:
- **`/query` (AI Query Interface):** Main conversational interface with response action buttons (Copy/Download PDF) and simulated delay states.
- **`/briefing` (Briefing Note Generator):** Side-by-side layout featuring configuration parameters (Subject, Date Range, Categories) and an automated Markdown document previewer for 6-part executive summaries.
- **`/documents` (Document Registry & Q&A):** Drag-and-drop upload interface with classification dropdowns alongside a searchable repository of past documents.
- **`/alerts` (Anomaly Alerts):** Tabular interface tracking deviations with color-coded severity badges and review status toggles.
- **`/matters` (Legal Matters):** Case management tracking for regulatory disputes and compliance deadlines.
- **`/history`, `/forecasts`, `/profile`:** Placeholder views matching the unified design system.

### Phase 4: Supabase Connection & Authentication
- Established the Supabase SSR (Server-Side Rendering) architecture by injecting `@supabase/supabase-js` and `@supabase/ssr` into the frontend.
- Created `utils/supabase/client.ts` and `utils/supabase/server.ts` to manage cookie-based authentication securely across Next.js boundaries.
- Set up the environment variables (`.env.local`) connecting directly to the newly styled Supabase Dashboard credentials (using the `Publishable key`).
- Built the **`/login`** page interface, wired to the `signInWithPassword` method. Enforced the "No Public Sign-ups" architecture, requiring admins to provision users directly via the Supabase Dashboard.

## Files Created / Modified

| File | Action | Purpose |
|------|--------|---------|
| `frontend/app/globals.css` | Modified | Overhauled default styles to enforce the PRD's neutral, analytical color palette. |
| `frontend/app/layout.tsx` | Modified | Set up the root HTML structure, injected the Inter font, added the Sidebar, and fixed hydration warnings. |
| `frontend/app/components/Sidebar.tsx` | Created | Persistent navigation component; automatically hides on the `/login` route. |
| `frontend/package.json` | Modified | Injected required dependencies (`lucide-react`, `@supabase/ssr`, `recharts`, `clsx`, `tailwind-merge`) and updated the `dev` script. |
| `frontend/app/query/page.tsx` | Created | Built the AI Query Interface chat UI. Added redirect from `/` to `/query`. |
| `frontend/app/briefing/page.tsx` | Created | Built the Briefing Note Generator tool interface. |
| `frontend/app/documents/page.tsx` | Created | Built the Document Registry upload and table view. |
| `frontend/app/alerts/page.tsx` | Created | Built the Anomaly Alerts table view. |
| `frontend/app/matters/page.tsx`, etc. | Created | Built the remaining scaffolding to eliminate 404 errors. |
| `frontend/utils/supabase/client.ts` | Created | Supabase Browser Client configuration. |
| `frontend/utils/supabase/server.ts` | Created | Supabase Server Client configuration with cookie management. |
| `frontend/app/login/page.tsx` | Created | Built the authentication UI and wired it to `signInWithPassword`. |
| `frontend/.env.local` | Created | Stored `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `README.md` | Created | Comprehensive project documentation for GitHub. |

---

*Session 2 complete. Frontend UI completely scaffolded, native compiler bugs resolved, and Supabase Auth connected.*

---
---

# EPDH Build Log - Session 3

**Date:** 15 May 2026  
**Objective:** Frontend branding refinements, navigation fixes, and briefing note category controls  
**Status:** Complete. UI refinements applied, active navigation fixed, new conversation reset wired, and briefing category select-all implemented.

## What Was Done

### Phase 1: Company Branding in Sidebar
- Added the company logo to the sidebar brand area using the existing `public/Excredite_logo.png` asset.
- Iterated on the brand layout based on visual feedback:
  - Increased logo size progressively.
  - Reduced and then adjusted the brand text size for better balance.
  - Moved the logo above the company name.
  - Centered both logo and text.
  - Tightened the spacing between the logo and text.
- Final sidebar brand treatment:
  - Logo displayed at `88x88`.
  - Brand block height set to `h-32`.
  - Company name shown below the logo as `Excredite Power Data Hub`.

### Phase 2: Sidebar Navigation Improvements
- Reduced sidebar width from `w-64` to `w-56` to make the main workspace feel less cramped.
- Fixed the active page indicator, which was previously hardcoded on **AI Query Interface**.
- Refactored the sidebar navigation into a `navItems` array.
- Active state now uses `usePathname()` so each sidebar item highlights correctly when its route is active:
  - `/query`
  - `/history`
  - `/briefing`
  - `/alerts`
  - `/documents`
  - `/forecasts`
  - `/matters`

### Phase 3: AI Query Interface Refinements
- Updated the AI Query Interface subtitle:
  - From: `Ask questions in plain English about generation, tariffs, or regulations.`
  - To: `Ask questions about generation, tariffs, or regulations.`
- Wired the **+ New Conversation** button.
- New conversation behavior now:
  - Clears the current message thread.
  - Clears the typed query.
  - Cancels any pending mock response timeout.
  - Restores the initial assistant greeting.

### Phase 4: Briefing Note Data Category Controls
- Added a **Select all** checkbox to the Briefing Note Generator data categories.
- The master checkbox now:
  - Selects all categories when checked.
  - Clears all categories when unchecked.
  - Automatically appears checked only when every individual category is selected.
- Existing category toggles remain functional.

### Phase 5: Logout Button Attempt and Revert
- Built a functional logout button prototype in the sidebar using `supabase.auth.signOut()`.
- Added temporary loading and error handling behavior for sign-out.
- Reverted the logout button and its logic after review, restoring the previous simple profile footer.
- No logout button is currently retained in the frontend.

## Files Modified

| File | Action | Purpose |
|------|--------|---------|
| `frontend/app/components/Sidebar.tsx` | Modified | Added and refined logo layout, reduced sidebar width, fixed route-based active navigation, and reverted logout prototype. |
| `frontend/app/query/page.tsx` | Modified | Updated subtitle text and implemented functioning New Conversation reset logic. |
| `frontend/app/briefing/page.tsx` | Modified | Added Select all control for briefing note data categories. |

## Verification

Ran:

```bash
npm.cmd run lint
```

Result:
- ESLint completed with **0 errors**.
- Existing unrelated warnings remain:
  - `frontend/app/documents/page.tsx`: unused `isUploading`, `setIsUploading`
  - `frontend/app/login/page.tsx`: unused `err`
  - `frontend/utils/supabase/server.ts`: unused `CookieOptions`

## Current Frontend Notes

- Supabase client utilities exist and login uses `signInWithPassword`.
- The app pages are still mostly mock/local-state driven.
- No `.env.local` file was found in the current local workspace during inspection, despite Session 2 noting one had been created.
- No Git repository was detected in this extracted project folder, so changes are being tracked manually through this build log rather than Git commits.

---

*Session 3 complete. Branding, navigation, AI query reset behavior, and briefing category controls updated.*
