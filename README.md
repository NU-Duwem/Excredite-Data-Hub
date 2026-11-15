# Excredite Power Data Hub (EPDH)

The **Excredite Power Data Hub (EPDH)** is a secure, centralized analytics and intelligence platform built exclusively for Nigeria's electricity sector. It serves as an internal tool for power analysts, regulatory teams, and executives to query industry data, generate automated briefing notes, and monitor anomaly alerts across Generation Companies (GENCOs), Distribution Companies (DISCOs), and the Transmission Company of Nigeria (TCN).

---

## 🏗 Architecture Overview

EPDH is built on a modern, serverless stack designed for high security and performance:

- **Frontend:** [Next.js 16](https://nextjs.org/) (App Router) + React 19
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Backend & Database:** [Supabase](https://supabase.com/) (Managed PostgreSQL)
- **Authentication:** Supabase Auth (Strict Admin-only provisioning)
- **Deployment:** Vercel (Frontend) & Supabase Platform (Backend/Edge Functions)

---

## 🚀 Features

- **AI Query Interface:** Plain-text querying interface for querying grid generation, tariffs, and regulations.
- **Briefing Note Generator:** Automated engine to compile data into a 6-part executive summary structure.
- **Anomaly Alerts:** System flags for unusual grid patterns (e.g., unexpected plant load drops).
- **Document Registry:** Secure repository for regulatory filings and legal matters, utilizing Row Level Security (RLS) for data isolation.
- **Administrative Access Control:** Strictly closed system with Role-Based Access Control (RBAC). Self-registration is disabled.

---

## 🛠 Local Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm
- A Supabase Project

### 1. Database Setup (Supabase)
To set up the database schema and RLS policies, execute the SQL files in your Supabase SQL Editor in the following order:
1. `schema.sql` - Provisions the core tables (organizations, plants, telemetry, matters).
2. `01_supabase_backend_setup.sql` - Configures `user_profiles`, database triggers, and all Row Level Security (RLS) policies.
3. `02_seed_data.sql` - Seeds initial Nigerian power sector data (States, GENCOs, DISCOs, TCN).
4. `03_epdh_updates.sql` to `06_document_embeddings_setup.sql` - Settings, activity log, news, matters and document embeddings.
5. `07_news_ingestion.sql` and `08_news_schedule.sql` - RSS news feeds and the hourly pull (see step 5 below).
6. `09_security_hardening.sql` - Fixes the Supabase security advisor findings. After this, new SQL must call `private.get_user_role()`; `public.get_user_role()` no longer exists.
7. In the dashboard, turn on **Authentication → Sign In / Providers → Email → Prevent use of leaked passwords**. This is not available in SQL, and needs a paid Supabase plan.

### 2. Frontend Setup
Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```
*(Note: If you are on Windows and experience native dependency errors, run `npm install --webpack` or force-install the native bindings like `@next/swc-win32-x64-msvc` if interrupted).*

### 3. Environment Variables
Create a `.env.local` file in the `frontend` directory with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key     # server-side API routes only
GEMINI_API_KEY=your_gemini_key                      # and/or ANTHROPIC_API_KEY
CRON_SECRET=a_long_random_string                    # protects /api/news/ingest
```

### Running the tests
```bash
cd frontend
npm test
```

### 5. News ingestion (RSS)
1. Run `07_news_ingestion.sql`, then `08_news_schedule.sql`, in the Supabase SQL Editor. Together they:
   - create `news_sources` and seed the feed list;
   - switch on `pg_cron` and `pg_net`;
   - store a randomly generated cron secret in Supabase Vault;
   - schedule an hourly pull at 7 minutes past each hour.
2. Once the app is deployed, connect the hourly job to it:
   - Set its address: `UPDATE public.system_settings SET value = 'https://<your-app-domain>' WHERE key = 'news_ingest_url';`
   - Copy the generated secret into the app's `CRON_SECRET` environment variable. Read it with `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'epdh_cron_secret';`.

   Until the address is set, the hourly job runs but does nothing.
3. Any signed-in user can pull immediately: **Refresh feeds** on News & Updates, or the refresh icon on the Overview's "Latest news" tile. Only one manual pull runs per 5 minutes across everyone.
4. Add, remove or pause feeds in the `news_sources` table. Use `filter_by_keywords = true` for general news sites, so only electricity stories are kept.
5. `frontend/vercel.json` also schedules a daily pull as a backup when hosted on Vercel. It's harmless to keep, and safe to delete.

### 4. Running the Application
Start the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔐 Security & User Provisioning

EPDH is a secure B2B tool. **Public sign-up is intentionally disabled.** 
To access the platform locally:
1. Go to your Supabase Dashboard -> **Authentication** -> **Users**.
2. Click **Add User** -> **Create New User**.
3. Provide an email and password, ensuring **Auto Confirm User** is checked.
4. Log into the EPDH portal at `/login` using these credentials.

---

## 📂 Project Structure

\`\`\`text
.
├── frontend/               # Next.js Application
│   ├── app/                # Next.js App Router (Pages & Layouts)
│   │   ├── alerts/         # Anomaly Alerts View
│   │   ├── briefing/       # Briefing Note Generator
│   │   ├── components/     # Reusable UI Components (Sidebar, etc.)
│   │   ├── documents/      # Document Registry
│   │   ├── login/          # Supabase Authentication View
│   │   └── query/          # AI Query Interface (Main View)
│   └── utils/
│       └── supabase/       # Supabase SSR Client & Server Utilities
├── supabase/               # Supabase Edge Functions & Configurations
├── schema.sql              # Core PostgreSQL Tables & Relationships
├── 01_supabase_backend_setup.sql # RLS Policies & User Profiles
└── 02_seed_data.sql        # Initial Nigerian Power Sector Seed Data
\`\`\`

---

## 📝 License

Proprietary & Confidential. All rights reserved by Excredite.
