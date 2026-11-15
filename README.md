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

### 5. News ingestion (RSS)
1. Run `07_news_ingestion.sql` in the Supabase SQL Editor. It creates `news_sources` and seeds the feed list.
2. Set `CRON_SECRET` in Vercel. `frontend/vercel.json` schedules a daily pull. For hourly pulls, use the optional `pg_cron` block at the end of `07_news_ingestion.sql`.
3. Admins can pull immediately with **Refresh feeds** on the News & Updates page.
4. Add, remove or pause feeds in the `news_sources` table. Use `filter_by_keywords = true` for general news sites, so only electricity stories are kept.

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
