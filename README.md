# Excredite Electricity Data Hub (EPDH)

The **Excredite Electricity Data Hub (EPDH)** is Excredite's internal intelligence platform for Nigeria's electricity sector. The legal, research and executive teams use it to:

- ask questions in plain English, answered from the firm's own documents;
- keep a searchable, access-controlled library of regulatory orders, judgments, tariffs, reports and briefs;
- follow power-sector news;
- run the firm's regulatory and advisory jobs, with tasks, owners and deadlines;
- catch anything that needs attention, through Alerts.

---

## 🏗 Architecture

| Layer | What it uses |
|---|---|
| Frontend | [Next.js 16](https://nextjs.org/) (App Router, webpack) and React 19, in `frontend/` |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) and Lucide icons; charts with Recharts |
| Database | [Supabase](https://supabase.com/) PostgreSQL with Row Level Security on every table |
| Auth | Supabase Auth. The login page's **Sign in with email** button uses Excredite's Microsoft 365 (Entra ID) behind the scenes, and email and password works until that's switched on. Only addresses on the allowed list (`public.allowed_accounts`, all `@excredite.ng`) can hold an account. Roles are stored in `user_profiles` and only admins or the server can set them |
| Document search | pgvector (384 dimensions, HNSW index) plus full-text search in one hybrid search function |
| Embeddings | `gte-small`, run locally by `@huggingface/transformers`. It's free and needs no API key |
| AI answers | Claude (Anthropic) or Gemini (Google). Claude defaults to `claude-opus-5-5`, with automatic fallback. The Drafting Desk uses the official Anthropic SDK (`@anthropic-ai/sdk`) with structured JSON output |
| Word files | `docx` writes Drafting Desk documents in Excredite's house style |
| Text extraction | pdfjs-dist (PDF), mammoth (Word), jszip (PowerPoint), xlsx (Excel/CSV) |
| News | RSS feeds pulled by `pg_cron` and `pg_net`, or on demand from the app |
| Edge functions | `admin-invite-user` and `generate-signed-url`, in `supabase/functions/` |
| Hosting | Vercel for the frontend (not deployed yet) and the Supabase platform for the backend |

---

## 🚀 Features

The sidebar has these pages:

- **Overview** (`/`): a bento dashboard with daily generation, installed capacity, open alerts, the next deadlines, document processing and the latest news.
- **AI Query Interface** (`/query`): ask questions about the sector. Answers come only from documents you're allowed to read, with citations to the document and page.
- **Conversation History** (`/history`): past AI conversations, which you can search, reopen, rename or delete.
- **Documents** (`/documents`): the document library.
  - Upload PDF, Word, PowerPoint, Excel, CSV, text or Markdown files. A confirmation panel shows the upload, the text extraction and when the document is ready for AI search.
  - Classifications: Public, Internal and Legal-Privileged. Every signed-in user can read every document unless an admin marks it **Restricted**; then only admins and the people they grant access can read it.
  - Preview, download, edit details, re-process and bulk delete.
  - Bulk import from a folder with `npm run import-docs` (see below).
- **Drafting Desk** (Documents → Generate a document): turns a request into a cited Word draft in four checkpoints.
  1. **Brief:** what you need, who will read it, the job, and whether to start from a firm template, a precedent or a blank page. EPDH finds matching library documents (only ones you can open), recent news and the job's tasks.
  2. **Evidence:** a table with sources as rows and questions as columns. Every cell is answered from that source with its page and a short quote, which is checked word for word against the source. You can correct any cell. Conflicts between sources are flagged and can be raised as an Alert.
  3. **Outline:** approve, reorder or edit the sections. Each shows the evidence it will use.
  4. **Draft & review:** written only from the evidence table, with every paragraph cited. Assumptions and gaps are flagged, AI revisions come back as tracked changes, and a pre-send checklist runs before you **Download Word** or **Save to the library** (linked to the job and searchable by the AI).

  Drafts autosave and are private to you. A finished run can be saved as a workflow for the team.
- **News & Updates** (`/news`): power-sector news from RSS feeds, with topic filters and **Refresh feeds**.
- **Regulatory & Advisory Matters** (`/matters`): a work board of the firm's jobs. Each job has a lead, a timeline and tasks, and each task has an assignee (one person or the whole team), a due date and a status.
- **Alerts** (`/alerts`): one place for anything the team must not miss:
  - possible breaches of the law;
  - urgent developments;
  - contradictions between documents;
  - unusual grid or market data;
  - system problems, such as a failing news feed.

  Alerts carry a severity and evidence, and critical ones are shown first. Anyone can report one, and the legal team, analysts, the CEO and admins triage them.
- **Admin Panel** (`/admin`), for admins only:
  - create users, change roles and suspend accounts;
  - upload or remove anyone's profile picture;
  - reset passwords and use "Sign out everywhere";
  - read the activity log;
  - change system settings;
  - manage access to restricted documents.
- **Profile & Settings** (`/profile`): your profile picture, details, sign-in method, password and preferences.

**Roles:** System Admin, CEO, Legal Team, Research Analyst, Data Ingestion and General Staff. New accounts start as General Staff.

**Profile pictures** appear in the sidebar, the Admin Panel and on the work board for task assignees and job leads. People without a picture are shown by their initials. Pictures are cropped to 256×256 in the browser and kept in a private storage bucket.

---

## 🛠 Local Setup

### Prerequisites
- Node.js 20 or later (22 is recommended), and npm
- A Supabase project. The Free plan is enough to start

### 1. Database
Run these files in the Supabase **SQL Editor**, in this order. Each one is safe to run once.

| # | File | What it does |
|---|---|---|
| 1 | `schema.sql` | Core tables: organisations, plants, telemetry, matters, documents |
| 2 | `01_supabase_backend_setup.sql` | `user_profiles`, the signup trigger and Row Level Security policies |
| 3 | `02_seed_data.sql` | Seed data: states, GENCOs, DISCOs and TCN |
| 4 | `03_epdh_updates.sql` | System settings, the activity log, news and matters |
| 5 | `04_name_fix.sql` | A one-off correction to seeded user names |
| 6 | `05_db_updates.sql` | Custom document types and seed data for matters |
| 7 | `06_document_embeddings_setup.sql` | pgvector and document chunks |
| 8 | `07_news_ingestion.sql` | News sources and the feed list |
| 9 | `08_news_schedule.sql` | `pg_cron` and `pg_net`, a Vault cron secret and the hourly pull (see **News** below) |
| 10 | `09_security_hardening.sql` | Fixes the Supabase security advisor findings and moves `get_user_role()` into the `private` schema |
| 11 | `10_news_topics.sql` | Topic tags for the News & Updates filters |
| 12 | `11_user_roles_lockdown.sql` | Users can't change their own role or status; adds `force_logout_user()` |
| 13 | `12_matter_tasks.sql` | Tasks on jobs, job leads and edit rights for the legal team |
| 14 | `13_alerts.sql` | Alert categories, severity, evidence, reporting, triage and automatic feed alerts |
| 15 | `14_news_sources_sections.sql` | Points outlets at their power and energy feeds |
| 16 | `15_document_access_and_search.sql` | Restricted documents and access grants; `gte-small` embeddings with hybrid search |
| 17 | `16_staff_emails.sql` | One-off: moves staff to their `firstname@excredite.ng` sign-in emails and removes the shared admin account |
| 18 | `17_profile_pictures_and_company_accounts.sql` | Profile pictures (column, private `avatars` bucket, storage rules, pictures on the work board) and a rule allowing only `@excredite.ng` accounts |
| 19 | `18_allowed_accounts.sql` | Only addresses on the server-only `allowed_accounts` list can hold an account |
| 20 | `19_temporary_passwords.sql` | One-time temporary passwords for a person's first sign-in (hashed, expire, lock after 5 wrong tries) |
| 21 | `20_matter_access.sql` | Per-person access to Regulatory & Advisory Matters: see everything and work on tasks (first grant: Taiwo) |
| 22 | `21_drafting.sql` | Drafting Desk: private autosaved drafts and shared workflows |
| 23 | `22_document_file_hash.sql` | Adds `documents.file_hash` (if missing) so uploads and the import tool can skip duplicate files |
| 24 | `23_failed_documents_admin_only.sql` | Documents whose processing failed are visible to System Admins only |
| 25 | `24_names_without_titles.sql` | Users' names (and lead counsel) are saved without titles such as Mr, Mrs, Dr, Barr, Engr |

**After running the SQL:**
- Deploy the edge functions with the [Supabase CLI](https://supabase.com/docs/guides/cli):

  ```bash
  supabase functions deploy admin-invite-user
  ```

  ```bash
  supabase functions deploy generate-signed-url
  ```
- **If you're upgrading an existing database to `15_…`:** open each existing document and click **Re-process**, so it is embedded with the new model.
- **Optional, paid plans only:** turn on **Authentication → Sign In / Providers → Email → Prevent use of leaked passwords**.

> **Rules for new SQL:**
> - Role checks call `private.get_user_role()`. `public.get_user_role()` no longer exists; don't recreate it.
> - New `SECURITY DEFINER` functions set `search_path = ''`, schema-qualify every name and revoke `EXECUTE` from `PUBLIC`, `anon` and `authenticated`.
> - Run the Supabase security advisor afterwards.
>
> See `CLAUDE.md`.

### 2. Install
```bash
cd frontend
```

```bash
npm install
```

### 3. Environment variables
Create `frontend/.env.local`. **Never commit it.**

```env
# Supabase (Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server only: API routes and the import tool

# AI answers: set at least one
ANTHROPIC_API_KEY=your_anthropic_key              # Claude
GEMINI_API_KEY=your_gemini_key                    # Gemini
# Optional model overrides
# ANTHROPIC_MODEL=claude-opus-5-5
# GEMINI_MODEL=gemini-2.5-flash

# News: protects /api/news/ingest (see News below)
CRON_SECRET=a_long_random_string

# Shows the "Sign in with email" button (Microsoft 365) instead of the password form,
# once it is set up in Supabase
# (see docs/technical/microsoft-365-sign-in.md)
# NEXT_PUBLIC_MICROSOFT_SIGN_IN=true

# ⚠️ DEVELOPMENT ONLY: a master password that signs in as any listed account
# (at least 16 characters). Works only with `npm run dev`; `npm run build` and
# `npm start` refuse to run while it is set. REMOVE BEFORE DEPLOYMENT.
# DEV_MASTER_PASSWORD=

# Optional
# NEXT_PUBLIC_SITE_URL=https://your-app-domain     # used in password-reset emails (default http://localhost:3000)
# EMBEDDINGS_CACHE_DIR=/path/to/cache              # where the gte-small model is stored
```

Document search needs no key. The free `gte-small` model (about 34 MB) downloads from Hugging Face the first time it's used.

### 4. Run
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Other scripts, run from `frontend/`:**

| Command | What it does |
|---|---|
| `npm run build`, then `npm start` | Production build and server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run import-docs -- <folder>` | Bulk document import (see below) |

`dev` uses webpack (`next dev --webpack`). The PDF reader and the embedding model are loaded by Node at run time instead of being bundled; see `serverExternalPackages` in `next.config.ts`.

---

## 🚦 Before deployment

Work through this list before the app goes live:

1. **⚠️ Remove the development master password.**
   - Delete `DEV_MASTER_PASSWORD` from `frontend/.env.local`, and make sure it is not in the hosting settings.
   - `npm run build` refuses to run while it's set, which is your reminder.
   - Remove the feature itself:
     - delete `frontend/app/api/auth/dev-master-sign-in/` and `frontend/utils/devMaster.ts` (and its test);
     - delete the "Developer sign-in" parts of `frontend/app/login/page.tsx`;
     - delete the guard at the top of `frontend/next.config.ts`.
2. **Retire old passwords** once everyone uses Sign in with email: step 6 in [`docs/technical/microsoft-365-sign-in.md`](docs/technical/microsoft-365-sign-in.md).
3. **Point the hourly news pull at the deployed address** (see **News** below), and set `CRON_SECRET`.
4. **Set the Site URL and redirect URLs** in Supabase to the live address (Part 2 of the sign-in guide).

---

## 📥 Bulk document import (for the AI)

Run this on the computer that holds the documents. Run it from `frontend/`, with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `frontend/.env.local`.

1. **Dry run first.** It reads and measures every file, but uploads and saves nothing:

   ```bash
   npm run import-docs -- "C:\path\to\folder" --dry-run
   ```

   The report lists:
   - files ready to import, files already imported, scanned files that need OCR, and unsupported files;
   - pages without text;
   - the number of chunks, and the estimated database and storage space.
2. **Start small:**

   ```bash
   npm run import-docs -- "C:\path\to\folder" --limit 5
   ```
3. **Then import the rest:** run it again without `--limit`. Files already imported are recognised by their content and skipped, so a stopped run can simply be restarted.

**Options:**

| Option | Meaning |
|---|---|
| `--dry-run` | Read and measure only |
| `--limit N` | Only the first N files, in alphabetical order |
| `--classification X` | `PUBLIC`, `INTERNAL` (the default) or `LEGAL_PRIVILEGED` |
| `--type X` | The document type for every file. By default it's guessed from the file name |
| `--restricted` | Mark the imported documents Restricted |
| `--text-only` | Don't upload the original files. This saves storage, but the library can't show or download them |
| `--skip-spreadsheets` | Leave out spreadsheets (`.xlsx`, `.xls`, `.xlsm`, `.csv`). Raw data tables use a lot of database space and add little to search |
| `--add-originals` | Later, after a `--text-only` import (for example on a bigger Supabase plan): upload the original files for documents already in the library, matched by content, so moved or renamed files still match. Text and search are unchanged. Add `--dry-run` to see what would be uploaded |
| `--uploaded-by EMAIL` | Recorded as the uploader (default `bulk-import`) |
| `--report FILE` | Where to write the JSON report |
| `--help` | Show help |

**Supported files:**
- PDF, read page by page;
- Word `.docx`;
- PowerPoint `.pptx`, read slide by slide;
- Excel `.xlsx` and `.xls`, `.csv`, `.txt` and `.md`.

Old `.doc` and `.ppt` files must first be saved in the newer format. Scanned pages are reported but not read yet, because OCR is a later step.

Files uploaded on the **Documents** page go through the same extraction and embedding.

---

## 📰 News (RSS)

1. `07_news_ingestion.sql` and `08_news_schedule.sql`:
   - create `news_sources` and seed the feed list;
   - switch on `pg_cron` and `pg_net`;
   - store a random cron secret in Supabase Vault;
   - schedule an hourly pull at 7 minutes past the hour.
2. **Once the app is deployed**, connect the hourly job to it:
   - Set the app's address:

     ```sql
     UPDATE public.system_settings SET value = 'https://<your-app-domain>' WHERE key = 'news_ingest_url';
     ```
   - Copy the Vault secret into the app's `CRON_SECRET`. You can read it with:

     ```sql
     SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'epdh_cron_secret';
     ```

   Until the address is set, the hourly job runs but does nothing.
3. **Pulling on demand:** any signed-in user can click **Refresh feeds** on News & Updates, or the refresh icon on the Overview's news tile. Only one manual pull runs every 5 minutes, across all users.
4. **Managing feeds:** add, remove or pause feeds in `news_sources`. Set `filter_by_keywords = true` for general news sites, so only electricity stories are kept.
5. `frontend/vercel.json` also schedules a daily pull on Vercel, as a backup.

---

## 🧪 Tests

```bash
cd frontend
```

```bash
npm test
```

Vitest covers:
- text extraction;
- import planning;
- embeddings;
- document access;
- alerts;
- matter tasks;
- query turns;
- chat sessions;
- news parsing, relevance, topics and cooldowns.

Tests that download the embedding model are skipped unless `RUN_MODEL_TESTS=1` is set.

---

## 🔐 Security & user accounts

- **Listed accounts only:** the database refuses any account whose address isn't on `public.allowed_accounts`, which may only hold `@excredite.ng` addresses. Only the server can read or change that list; the Admin Panel's **Add user** puts the new address on it. There's no self sign-up: `/signup` redirects to the login page.
- **Sign in with email:** once your Microsoft 365 admin registers EPDH, the login page shows a single **Sign in with email** button. Behind it, staff sign in with their Excredite Microsoft 365 account. Their first sign-in links to their existing EPDH account by email. Setup steps are in [`docs/technical/microsoft-365-sign-in.md`](docs/technical/microsoft-365-sign-in.md), which also covers sending EPDH's emails from `noreply@excredite.ng`.
- **Adding users:** admins use **Add user** in the **Admin Panel** (service-role key on the server). EPDH shows a **temporary password** once: it works for the person's **first sign-in only**, expires after 3 days and locks after 5 wrong tries. Only a hash is stored. The person chooses **First time? Use a temporary password** on the login page. Admins can issue a new one at any time with **Issue temporary password**; the old one stops working.
- **After the first sign-in:** people use **Sign in with email** (Microsoft 365). Until that's switched on, they're asked to choose their own password straight after their first sign-in.
- **⚠️ Development master password:** while developing, `DEV_MASTER_PASSWORD` in `frontend/.env.local` lets you sign in as any listed, active account through **Developer sign-in** on the login page. The page shows an amber "Development mode" warning while it's on. It never works in a production build or deployment, but remove it before going live (see **Before deployment**).
- **Signing out:** **Sign out** is at the bottom of the sidebar on computers, and in the top bar on phones.
- **Self-registration:** the `/signup` page only works while **Authentication → Sign In / Providers → Allow new users to sign up** is on in Supabase. Accounts created there start as **General Staff**, and only an admin can change a role. To keep the platform closed, turn that setting off.
- **Data access:** Row Level Security protects every table. The AI only searches documents the person asking is allowed to read.
- **API routes:** every route checks the signed-in user and their role on the server. Roles are never taken from browser-supplied data.
- **Keys:** the service-role key and AI keys stay on the server. Never put them in a `NEXT_PUBLIC_` variable.

---

## 📚 Documentation

Project documents are in [`docs/`](docs/):

- **`docs/frontend/`**
  - **Frontend Requirements** (`.docx`): what each page must do.
  - **Frontend Improvement Log** (`.docx`): required and recommended changes, from a review of the app against the requirements.
  - **`frontend improvement.md`**: the May 2026 refinement log.
  - **`conti.md`**: requested updates to Profile & Settings and other pages.
- **`docs/technical/`**
  - **Master Technical Documentation** (Supabase + Vercel edition, `.docx`).
  - **`build_log_session_1.md`**: the first database build session.
  - **`microsoft-365-sign-in.md`**: setting up Sign in with email (Microsoft 365) and company email sending.

The full history of code and database changes is in [`Tracked-changes.md`](Tracked-changes.md).

---

## 📂 Project structure

```text
.
├── frontend/                     # Next.js app
│   ├── app/
│   │   ├── page.tsx              # Overview
│   │   ├── query/                # AI Query Interface
│   │   ├── history/              # Conversation History
│   │   ├── documents/            # Document library, upload, access control
│   │   ├── news/                 # News & Updates
│   │   ├── matters/              # Regulatory & Advisory work board
│   │   ├── alerts/               # Alerts
│   │   ├── admin/                # Admin Panel
│   │   ├── profile/              # Profile & Settings
│   │   ├── login/ signup/ forgot-password/ reset-password/
│   │   ├── auth/callback/        # Finishes Sign in with email (Microsoft 365)
│   │   ├── api/auth/             # Temporary-password sign-in; first password chosen
│   │   ├── components/           # Sidebar, Avatar, AvatarEditor
│   │   └── api/                  # Server routes: chat, documents, drafting, news ingest, admin users
│   ├── utils/                    # Extraction, embeddings, access, alerts, news, drafting, Supabase clients (+ __tests__)
│   ├── scripts/import-documents.ts   # Bulk import tool
│   ├── next.config.ts
│   └── vercel.json               # Daily news pull on Vercel
├── supabase/functions/           # Edge functions: admin-invite-user, generate-signed-url
├── schema.sql                    # Core tables
├── 01_… to 21_….sql              # Migrations, run in order (see Local Setup)
├── docs/                         # Requirements and technical documentation
├── Tracked-changes.md            # Change log
└── CLAUDE.md                     # Rules for branches, the change log and SQL
```

---

## 📝 License

Proprietary and confidential. All rights reserved by Excredite.
