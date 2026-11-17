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
| Auth | Supabase Auth. Roles are stored in `user_profiles` and only admins or the server can set them |
| Document search | pgvector (384 dimensions, HNSW index) plus full-text search in one hybrid search function |
| Embeddings | `gte-small`, run locally by `@huggingface/transformers`. It's free and needs no API key |
| AI answers | Claude (Anthropic) or Gemini (Google). Claude defaults to `claude-opus-5-5`, with automatic fallback |
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
  - reset passwords and use "Sign out everywhere";
  - read the activity log;
  - change system settings;
  - manage access to restricted documents.
- **Profile & Settings** (`/profile`): your details, password and preferences.

**Roles:** System Admin, CEO, Legal Team, Research Analyst, Data Ingestion and General Staff. New accounts start as General Staff.

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

- **Adding users:** admins add users, with a role and a starting password, from the **Admin Panel**. This uses the server's service-role key. Admins can also send a password-reset email from there.
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
│   │   ├── components/           # Sidebar
│   │   └── api/                  # Server routes: chat, documents, news ingest, admin users
│   ├── utils/                    # Extraction, embeddings, access, alerts, news, Supabase clients (+ __tests__)
│   ├── scripts/import-documents.ts   # Bulk import tool
│   ├── next.config.ts
│   └── vercel.json               # Daily news pull on Vercel
├── supabase/functions/           # Edge functions: admin-invite-user, generate-signed-url
├── schema.sql                    # Core tables
├── 01_… to 16_….sql              # Migrations, run in order (see Local Setup)
├── docs/                         # Requirements and technical documentation
├── Tracked-changes.md            # Change log
└── CLAUDE.md                     # Rules for branches, the change log and SQL
```

---

## 📝 License

Proprietary and confidential. All rights reserved by Excredite.
