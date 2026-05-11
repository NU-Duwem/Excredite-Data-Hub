**EXCREDITE CONSULTING**

**EXCREDITE POWER DATA HUB (EPDH)**

**Master Technical Documentation**

_Complete Project Reference - Build Log - Q&A Record - Troubleshooting Guide_

Abuja, Nigeria | 2026

This document is the complete technical and non-technical reference for the Excredite Power Data Hub project. It covers every decision made, every command executed, every line of code written, every question asked and answered, and every problem encountered and solved from the beginning of the project to the current state of the build. It is written to be understood by both technical and non-technical readers.

The document is organised into fifteen chapters. Chapters 1 through 5 cover the project background, requirements, and database design. Chapters 6 through 9 cover the infrastructure, users, and security. Chapters 10 through 12 cover the dashboard, AI, and data ingestion layers. Chapter 13 covers costs. Chapter 14 is a complete Q&A record of every markup question raised and answered. Chapter 15 is the problems and solutions log.

**Chapter 1: Project Background and Purpose**

**1.1 Who We Are**

Excredite Consulting is a Nigerian energy law and regulatory advisory firm based in Abuja. The firm advises clients on electricity sector regulation, licensing, tariff disputes, arbitration, and policy matters. The Head of Research and Data Analytics is Dr. Odugbemi Taiwo Hassan. The firm is led by Barrister Eyo Ekpo.

**1.2 The Problem**

Nigeria's electricity sector generates a continuous and growing volume of data - daily generation figures, tariff determinations, regulatory enforcement actions, market settlements, distribution performance statistics, and policy documents. This data is currently scattered across government websites, PDF reports, spreadsheets, and email correspondence. There is no single place where it is organised, connected, and immediately useful. Advisory work that should take minutes instead takes hours because the data must be hunted down, reconciled, and manually assembled every time.

**1.3 The Solution**

The Excredite Power Data Hub (EPDH) is a centralised database platform designed to collect, store, organise, analyse, and visualise all critical power sector data in one place. It will serve as the firm's primary research and intelligence infrastructure, enabling faster and better-informed advisory work, supporting client engagements with quantitative evidence, and positioning Excredite as the most data-capable firm in the Nigerian energy advisory market.

**1.4 The Technology Stack**

Every component chosen is either free and open-source, or a pay-as-you-use managed service. The open-source components - PostgreSQL, TimescaleDB, Apache Airflow, Apache Superset, LangChain, Next.js, Docker, pgvector, and Facebook Prophet - carry no licence costs at any scale. Supabase provides the backend platform, including managed PostgreSQL, authentication, row-level security, storage, generated APIs, and server-side functions. The frontend will be built in Next.js and deployed on Vercel. The Anthropic Claude API has no free tier and is charged per token from the first call.

| **Component**        | **Purpose**                                        | **Cost**                 |
| -------------------- | -------------------------------------------------- | ------------------------ |
| PostgreSQL 18        | Primary relational database engine                 | Free                     |
| TimescaleDB 2.24.0   | Time-series performance extension                  | Free (Community Edition) |
| pg_trgm              | Text search extension                              | Free                     |
| pgvector             | AI vector embeddings (deferred)                    | Free                     |
| Apache Airflow       | Data ingestion pipeline orchestration              | Free (self-hosted)       |
| Apache Superset      | Dashboard and visualisation layer                  | Free                     |
| LangChain            | AI orchestration framework                         | Free                     |
| Next.js              | Frontend and application layer                     | Free                     |
| Facebook Prophet     | Generation output forecasting                      | Free                     |
| Docker               | Containerisation                                   | Free                     |
| Supabase Postgres    | Managed backend database hosting                   | Pay-as-you-use           |
| Supabase Storage     | Document and file storage                          | Pay-as-you-use           |
| OCR / PDF extraction | PDF text extraction selected during implementation | Pay-as-you-use           |
| Vercel               | Next.js frontend deployment                        | Pay-as-you-use           |
| Anthropic Claude API | AI language model                                  | Per token - no free tier |

**1.5 Build Sequence**

The platform is built in deliberate phases so that each layer is verified before the next is added.

1\. Local database - build and verify the schema, load historical data, test all queries

2\. Docker - containerise the entire setup for portability

3\. Supabase and Vercel deployment - move backend to Supabase, deploy the Next.js frontend on Vercel, and configure backups and disaster recovery

4\. Dashboard layer - build Apache Superset dashboards

5\. Application layer - build the Next.js middleware

6\. AI layer - natural language querying, document Q&A, anomaly detection, forecasting, briefing notes

**Chapter 2: Project Requirements**

The following requirements define the complete scope of the platform. All markups and revisions made during the build process are noted where relevant.

**Requirement 1 - Core Database**

A PostgreSQL relational database named powerdata, hosted locally during development and deployed to Supabase upon completion, capable of storing and querying decades of Nigerian electricity sector data across eight categories: generation, transmission, distribution, tariff and market data, off-grid and energy access, regulatory and policy records, geospatial energy data, and power financial markets data.

**Requirement 2 - Time-Series Performance**

TimescaleDB installed as an extension on PostgreSQL to handle high-volume time-series generation data efficiently, enabling the database to store and query hundreds of millions of time-stamped records without performance degradation as the dataset grows over time.

**Requirement 3 - User Access System**

A structured user access system comprising the following database roles, each with permissions calibrated to their function. The count of legal accounts is not fixed - it grows if the firm takes on additional lawyers, with no changes to the database structure required.

| **Account**     | **Assigned To**                     | **Access Level**                                                  |
| --------------- | ----------------------------------- | ----------------------------------------------------------------- |
| postgres        | Built-in superuser                  | Full system access - use sparingly                                |
| power_admin     | Database administrator (Dr. Hassan) | Superuser - all privileges                                        |
| power_ceo       | Barrister Eyo Ekpo exclusively      | SELECT all tables + BYPASSRLS - full unrestricted read visibility |
| power_app       | Application layer                   | SELECT, INSERT, UPDATE                                            |
| power_analyst   | Analysts and researchers            | SELECT only                                                       |
| power_ingestion | Data ingestion pipeline             | SELECT, INSERT, UPDATE                                            |
| power_team      | General staff                       | SELECT only                                                       |
| power_ai        | AI service layer                    | SELECT only - no legal or confidential data                       |
| power_legal     | All legal team members (shared)     | SELECT only on matters and linked tables                          |

Note: power_ceo is assigned exclusively to Barrister Eyo Ekpo. It is not a superuser account - superuser status is reserved for power_admin and postgres only. The BYPASSRLS privilege gives Barrister Ekpo full visibility across all data including any table subject to row-level security policies, now or in the future.

Note: power_legal is a shared account used by all members of the legal team. Row-level security is not applied to this account as it cannot function correctly with a shared login. Access control for legal matters is managed at the Superset dashboard level.

**Requirement 4 - Database Schema**

A complete schema of relational tables built around the Nigerian electricity value chain: states, organisations, power plants, generation output, gas supply, transmission data, distribution performance, tariff orders, tariff bands, regulatory actions, documents, matters, and AI artefact tables.

**Requirement 5 - Data Ingestion Pipeline**

An automated data ingestion pipeline using Apache Airflow to collect, validate, transform, and load data from primary sources including TCN, NBET, NERC, NNPC, NDPRA, the Rural Electrification Agency, and international bodies such as the IEA and World Bank. Data from Nigerian regulatory bodies is not always published in machine-readable formats and will require formal access requests. The ingestion pipeline must be built with format flexibility and error tolerance as core requirements. This is the most labour-intensive and unpredictable component of the project.

During the build phase, TCN daily generation data is loaded manually - a designated person downloads the report, processes it through the ingestion script, validates the output, and triggers the load. This becomes fully automated via Airflow once that component is complete.

**Requirement 6 - Dashboards**

Five interactive dashboards built in Apache Superset: National Grid KPI Dashboard, Tariff and Revenue Analytics, Regulatory Actions Tracker, Legal Matters Monitor, and Executive Summary Dashboard. Accessible via a secured HTTPS web address from any browser, requiring individual login credentials.

**Requirement 7 - Artificial Intelligence Layer**

An AI layer using the Anthropic Claude API via LangChain providing five capabilities: natural language querying, document Q&A via retrieval-augmented generation, anomaly detection on generation data, predictive forecasting, and AI-generated briefing notes. The pgvector extension required for document embeddings has not yet been installed and will be added at the start of the AI build phase.

**Requirement 8 - Cloud Deployment**

Supabase PostgreSQL as the managed backend database, Supabase Storage for document and file storage, Supabase Auth and row-level security for access control, and Vercel for hosting the Next.js frontend. PDF text extraction will be handled in the ingestion/application layer using an OCR service or library selected during implementation.

**Requirement 9 - Containerisation**

Full containerisation using Docker and Docker Compose, packaging all services into portable containers that run identically in local development and cloud production environments.

**Requirement 10 - Local Backup**

A local backup of the Supabase PostgreSQL database will be retained and updated periodically using an automated pg_dump script scheduled via Windows Task Scheduler. Backups run weekly during the early build phase and daily once the generation output ingestion pipeline is live. Each backup is encrypted and stored locally, with a secondary copy held on an external drive or cloud storage as an additional safeguard.

**Requirement 11 - Historical Data**

Historical data will be loaded going back to 2010 - fifteen years of generation output, tariff history, and regulatory records. This is a minimum baseline. Barrister Eyo Ekpo holds additional historical records that have not yet been reviewed. Once that dataset has been assessed, the coverage may extend significantly further back. This document will be updated to reflect the confirmed start date following that review.

**Chapter 3: Setting Up the Database Environment**

**3.1 Software Installed**

• PostgreSQL 18 - installed on Windows via the official PostgreSQL installer

• TimescaleDB 2.24.0 - installed via StackBuilder after PostgreSQL installation

• pgAdmin 4 - installed alongside PostgreSQL, used as the visual management interface

• Windows Command Prompt - used for direct psql terminal access

**3.2 Connecting to PostgreSQL**

Two methods are used to interact with the database throughout the build.

**Method 1 - Terminal (psql)**

| psql -U postgres -h localhost         |
| ------------------------------------- |
| \-- Enter password when prompted      |
| \-- Switch to the powerdata database: |
| \\c powerdata                         |
| \-- Prompt changes to: powerdata=#    |

**Method 2 - pgAdmin 4**

Open pgAdmin 4 in the browser. Enter the master password. Expand Servers → PostgreSQL 18 → Databases → powerdata → Schemas → public. Open the Query Tool from the Tools menu. Commands are executed with F5.

Important: Copy-pasting multi-line SQL into pgAdmin causes formatting corruption due to invisible characters. For complex multi-line commands, use the terminal. For simple single-line commands, pgAdmin works reliably.

**3.3 Creating the Database**

| CREATE DATABASE powerdata |
| ------------------------- |
| ENCODING 'UTF8'           |
| TEMPLATE template0;       |

| **Part**                  | **Explanation**                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| CREATE DATABASE powerdata | Creates a new database named powerdata                                                            |
| ENCODING 'UTF8'           | Stores all text using UTF-8 - handles all characters including Nigerian names and special symbols |
| TEMPLATE template0        | Starts from the cleanest possible empty template with no inherited settings                       |
| Semicolon ;               | Every SQL command must end with a semicolon - it signals the end of the instruction               |

**3.4 Enabling Extensions**

| CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE; |
| --------------------------------------------------- |
| CREATE EXTENSION IF NOT EXISTS pg_trgm;             |

| **Part**         | **Explanation**                                                                      |
| ---------------- | ------------------------------------------------------------------------------------ |
| CREATE EXTENSION | Enables an extension inside the current database                                     |
| IF NOT EXISTS    | Safety clause - if already enabled, do nothing instead of showing an error           |
| timescaledb      | The time-series performance extension                                                |
| CASCADE          | Automatically enables any extensions that timescaledb depends on                     |
| pg_trgm          | The text search extension - enables fast flexible searching through document content |

Note: pgvector was not installed. It requires a separate download on Windows and has been deferred to the AI build phase. PostgreSQL lib folder path for future installation: C:/PROGRA~1/POSTGR~1/18/lib

**Chapter 4: Database Schema**

**4.1 Schema Overview**

All tables live inside the public schema within the powerdata database. The schema is built around the Nigerian electricity value chain. Two tables have been built so far. The remaining tables will be designed once raw data samples from TCN, NBET, and NERC have been obtained, so the structure reflects the actual format of the data rather than assumptions.

| **Table**                | **Status**                       | **Purpose**                                            |
| ------------------------ | -------------------------------- | ------------------------------------------------------ |
| states                   | Built - 37 rows                  | Geographic foundation - all 36 states and FCT          |
| organisations            | Built - empty                    | Master register of all sector entities                 |
| power_plants             | Planned                          | Details of every generating facility                   |
| generation_output        | Planned - TimescaleDB hypertable | Daily MWh output per plant                             |
| gas_supply               | Planned                          | Daily gas nominations and deliveries per thermal plant |
| transmission_data        | Planned                          | Wheeling capacity, losses, grid events                 |
| distribution_performance | Planned                          | ATC&C losses, billing, metering                        |
| tariff_orders            | Planned                          | Full MYTO history from 2008                            |
| tariff_bands             | Planned                          | Rates per customer band per DISCO                      |
| regulatory_actions       | Planned                          | Fines, licences, directives, investigations            |
| documents                | Planned                          | Metadata registry for all PDFs and official documents  |
| matters                  | Planned                          | Active legal and advisory engagements                  |
| embeddings               | Planned                          | AI vector embeddings for document search               |
| conversation_log         | Planned                          | Log of all AI natural language queries                 |
| anomaly_alerts           | Planned                          | AI-generated anomaly detection alerts                  |
| forecasts                | Planned                          | AI-generated forecast outputs                          |

**4.2 The States Table**

**Purpose**

The geographic foundation of the entire database. Every organisation, power plant, and distribution zone belongs to a state. Rather than typing the state name repeatedly in every table, each state is stored once here and referenced everywhere else by its unique ID. This is called normalisation - store once, reference everywhere.

**CREATE TABLE Command**

| CREATE TABLE states (                          |
| ---------------------------------------------- |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(), |
| name TEXT NOT NULL UNIQUE,                     |
| code VARCHAR(5) NOT NULL,                      |
| geopolitical_zone TEXT,                        |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  |
| );                                             |

**Column Explanations**

| **Column**        | **Type**    | **Constraints**   | **Meaning**                                                                                                                  |
| ----------------- | ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| id                | UUID        | PRIMARY KEY, AUTO | Unique identifier generated automatically by PostgreSQL. Never typed manually. Example: a3f8c2d1-4b7e-4c9a-8d2f-1e6b3a9c7d5e |
| name              | TEXT        | NOT NULL, UNIQUE  | Full state name e.g. Lagos. Cannot be empty. No two states can have the same name.                                           |
| code              | VARCHAR(5)  | NOT NULL          | Short abbreviation e.g. LA. Maximum 5 characters.                                                                            |
| geopolitical_zone | TEXT        | Optional          | Which of the six zones the state belongs to. Can be left blank.                                                              |
| created_at        | TIMESTAMPTZ | NOT NULL, AUTO    | Date and time this row was added, including timezone. Filled automatically.                                                  |

**Key Concepts**

**UUID - Universally Unique Identifier**

A 128-bit number generated randomly. The probability of two UUIDs ever being identical is astronomically small - treated as impossible. Used instead of simple numbers (1, 2, 3) because UUIDs work safely across multiple databases and imports without collision.

**PRIMARY KEY**

The main identifier for every row in a table. Must be unique and cannot be empty. When other tables want to reference a state, they store that state's primary key value in their own state_id column.

**TIMESTAMPTZ**

Timestamp With Time Zone. Stores both a date and a time including timezone information. Example: 2026-03-10 14:35:22+01. Handles timezone conversions automatically.

**NOT NULL**

A constraint that prevents a column from being left empty. If you try to insert a row without providing a value for a NOT NULL column, PostgreSQL rejects it with an error.

**Inserting the 37 States**

| INSERT INTO states (name, code, geopolitical_zone) VALUES |
| --------------------------------------------------------- |
| ('Abia', 'AB', 'South East'),                             |
| ('Adamawa', 'AD', 'North East'),                          |
| ('Akwa Ibom', 'AK', 'South South'),                       |
| \-- ... 34 more states ...                                |
| ('Zamfara', 'ZA', 'North West');                          |

| **Part**                        | **Explanation**                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| INSERT INTO states              | Add new rows to the states table                                                              |
| (name, code, geopolitical_zone) | Columns being filled in. id and created_at are excluded - PostgreSQL fills them automatically |
| VALUES                          | Everything after this keyword is the actual data                                              |
| ('Abia', 'AB', 'South East'),   | One row of data. Three values corresponding to the three columns listed above                 |
| Single quotes around text       | Text values in SQL must always use single quotes. Double quotes mean something different.     |

**Verification Tests - States Table**

**Test 1 - Count rows**

SELECT COUNT(\*) FROM states;

Expected result: 37

**Test 2 - View all states**

SELECT name, code, geopolitical_zone FROM states ORDER BY name;

Expected result: All 37 states listed alphabetically.

**Test 3 - Count by zone**

| SELECT geopolitical_zone, COUNT(\*) AS number_of_states |
| ------------------------------------------------------- |
| FROM states                                             |
| GROUP BY geopolitical_zone                              |
| ORDER BY geopolitical_zone;                             |

**Test 4 - Check for duplicates**

| SELECT name, COUNT(\*) AS occurrences FROM states |
| ------------------------------------------------- |
| GROUP BY name HAVING COUNT(\*) > 1;               |

Expected result: 0 rows - no duplicates.

**Test 5 - Check for missing codes**

SELECT name FROM states WHERE code IS NULL;

Expected result: 0 rows - every state has a code.

**4.3 The Organisations Table**

**Purpose**

The master register of every entity in Nigeria's electricity sector - every GENCO, DISCO, TCN, NBET, NERC, NEMSA, state electricity agency, and independent power producer. Every other table in the database references this one. Storing each organisation once here and referencing it everywhere else ensures consistency and eliminates repetition.

**CREATE TABLE Command**

| CREATE TABLE organisations (                   |
| ---------------------------------------------- |
| id UUID PRIMARY KEY DEFAULT gen_random_uuid(), |
| name TEXT NOT NULL,                            |
| short_name VARCHAR(20),                        |
| org_type TEXT NOT NULL,                        |
| rc_number VARCHAR(20),                         |
| date_licensed DATE,                            |
| status TEXT NOT NULL DEFAULT 'ACTIVE',         |
| state_id UUID,                                 |
| website TEXT,                                  |
| notes TEXT,                                    |
| created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), |
| updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), |
| deleted_at TIMESTAMPTZ                         |
| );                                             |

**Constraints Added via ALTER TABLE**

| \-- Restrict org_type to valid values only                         |
| ------------------------------------------------------------------ |
| ALTER TABLE organisations ADD CONSTRAINT check_org_type            |
| CHECK (org_type IN ('GENCO','DISCO','TCN','NBET','NERC',           |
| 'IPP','STATE_AGENCY','OTHER'));                                    |
|                                                                    |
| \-- Restrict status to valid values only                           |
| ALTER TABLE organisations ADD CONSTRAINT check_status              |
| CHECK (status IN ('ACTIVE','REVOKED','SUSPENDED','DEREGISTERED')); |
|                                                                    |
| \-- Link state_id to the states table                              |
| ALTER TABLE organisations ADD CONSTRAINT fk_state                  |
| FOREIGN KEY (state_id) REFERENCES states(id);                      |

**Column Explanations**

| **Column**    | **Type**      | **Explanation**                                                                              |
| ------------- | ------------- | -------------------------------------------------------------------------------------------- |
| id            | UUID          | Unique identifier. Auto-generated.                                                           |
| name          | TEXT NOT NULL | Full official name e.g. Nigerian Electricity Regulatory Commission                           |
| short_name    | VARCHAR(20)   | Abbreviation e.g. NERC, IKEDC, TCN. Max 20 characters.                                       |
| org_type      | TEXT NOT NULL | Category. Only accepts: GENCO, DISCO, TCN, NBET, NERC, IPP, STATE_AGENCY, OTHER              |
| rc_number     | VARCHAR(20)   | CAC registration number. Optional.                                                           |
| date_licensed | DATE          | Date NERC issued the licence. Optional.                                                      |
| status        | TEXT NOT NULL | Operating status. Defaults to ACTIVE. Only accepts: ACTIVE, REVOKED, SUSPENDED, DEREGISTERED |
| state_id      | UUID          | Foreign key linking to states table. Stores the UUID of the relevant state.                  |
| website       | TEXT          | Organisation website. Optional.                                                              |
| notes         | TEXT          | Free text for additional information. Optional.                                              |
| created_at    | TIMESTAMPTZ   | Date and time row was created. Auto-filled.                                                  |
| updated_at    | TIMESTAMPTZ   | Date and time row was last modified. Updated manually.                                       |
| deleted_at    | TIMESTAMPTZ   | Soft delete column. Empty by default. Set when organisation closes.                          |

**Key Concepts**

**CHECK Constraint**

A rule restricting what values can be stored in a column. PostgreSQL rejects any value not on the approved list - including values with typos, wrong capitalisation, or trailing spaces. This enforces data quality at the database level regardless of how data enters the system.

**Foreign Key**

A column in one table that points to the primary key of another table. state_id REFERENCES states(id) means the value stored in state_id must exist as an id in the states table. PostgreSQL rejects any state_id that does not exist in states. This prevents orphaned data.

**Soft Delete**

Instead of deleting a row - which permanently destroys the historical record - a soft delete records the closure date in the deleted_at column. The row remains in the database forever. Essential for a regulatory and legal advisory firm where historical records must be preserved. When querying active organisations, the filter WHERE deleted_at IS NULL is added.

**DEFAULT**

An automatic value used when no value is provided. status defaults to ACTIVE, meaning new organisations are assumed to be active unless specified otherwise. created_at and updated_at default to NOW() - the current timestamp at the moment of insertion.

**Verification Tests - Organisations Table**

**Test 1 - Confirm table structure**

| SELECT column_name, data_type, is_nullable |
| ------------------------------------------ |
| FROM information_schema.columns            |
| WHERE table_name = 'organisations'         |
| ORDER BY ordinal_position;                 |

**Test 2 - Confirm table is empty and ready**

SELECT COUNT(\*) FROM organisations;

Expected result: 0

**Test 3 - Confirm CHECK constraint on org_type works**

INSERT INTO organisations (name, org_type) VALUES ('Test', 'INVALID_TYPE');

Expected result: ERROR - check constraint violated. This is correct.

**Test 4 - Confirm CHECK constraint on status works**

INSERT INTO organisations (name, org_type, status) VALUES ('Test', 'GENCO', 'INVALID');

Expected result: ERROR - check constraint violated. This is correct.

**Test 5 - Confirm foreign key works**

| INSERT INTO organisations (name, org_type, state_id)              |
| ----------------------------------------------------------------- |
| VALUES ('Test', 'GENCO', '00000000-0000-0000-0000-000000000000'); |

Expected result: ERROR - foreign key constraint violated. This is correct.

**4.4 Planned: Gas Supply Table**

A dedicated gas supply table will record daily gas nominations and actual deliveries for every thermal generation plant, alongside gas price per MSCF, supply interruption events, and pipeline constraint flags. Data will be sourced from NNPC and the Nigerian Downstream Petroleum Regulatory Authority (NDPRA), supplemented by NBET monthly market settlement reports. This table is essential because the majority of Nigeria's installed generation capacity is thermal - a plant may be fully operational yet produce nothing if gas does not arrive. When read alongside the generation output table, it allows the platform to distinguish between curtailment caused by gas shortage, transmission constraints, or plant-level mechanical failure. Access to NNPC and NDPRA data will require formal procurement requests rather than routine automated ingestion.

**Chapter 5: User Accounts and Permissions**

**5.1 Why Separate Users**

The postgres superuser has unrestricted access to everything. Using it for day-to-day work is unnecessarily risky. Instead, specific user accounts are created for each type of task with only the permissions each role needs. This is the Principle of Least Privilege - a fundamental security practice.

**5.2 Creating Users**

| CREATE USER power_admin WITH PASSWORD 'Admin2026!';      |
| -------------------------------------------------------- |
| CREATE USER power_CEO WITH PASSWORD 'CEO2026!';          |
| CREATE USER power_app WITH PASSWORD 'AppUser2026!';      |
| CREATE USER power_analyst WITH PASSWORD 'Analyst2026!';  |
| CREATE USER power_ingestion WITH PASSWORD 'Ingest2026!'; |
| CREATE USER power_team WITH PASSWORD 'Team2026!';        |
| CREATE USER power_ai WITH PASSWORD 'AI2026!';            |
| CREATE USER power_legal WITH PASSWORD 'Legal2026!';      |

| **Part**            | **Explanation**                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------- |
| CREATE USER         | Creates a new user account. PostgreSQL calls users roles - both terms refer to the same thing |
| power_admin (etc.)  | The name of the user. PostgreSQL automatically converts to lowercase internally               |
| WITH PASSWORD '...' | Sets the login password. Enclosed in single quotes.                                           |

**5.3 Making power_admin a Superuser**

ALTER USER power_admin WITH SUPERUSER;

ALTER USER modifies an existing user. WITH SUPERUSER grants full unrestricted access. Use this account only for database administration, never for day-to-day work.

**5.4 Granting power_ceo BYPASSRLS**

ALTER USER power_ceo BYPASSRLS;

BYPASSRLS allows this account to bypass row-level security policies on all tables. This gives Barrister Ekpo full visibility across all data on the platform - including any table subject to row-level security now or in the future - without granting superuser privileges. Superuser status remains reserved for power_admin and postgres only.

**5.5 Verifying User Privileges**

| SELECT usename, usesuper, usecreatedb |
| ------------------------------------- |
| FROM pg_user                          |
| ORDER BY usename;                     |

Note: The column usecreaterole does not exist in PostgreSQL 18. Use the query above. usename shows the username. usesuper shows true for superusers. usecreatedb shows true if the user can create databases.

**5.6 Granting Permissions - Three Levels**

Permissions in PostgreSQL are granted in three layers. All three must be done in order.

**Level 1 - Connect to the database**

| GRANT CONNECT ON DATABASE powerdata                 |
| --------------------------------------------------- |
| TO power_CEO, power_app, power_analyst,             |
| power_ingestion, power_team, power_ai, power_legal; |

**Level 2 - Access the schema**

| GRANT USAGE ON SCHEMA public                        |
| --------------------------------------------------- |
| TO power_CEO, power_app, power_analyst,             |
| power_ingestion, power_team, power_ai, power_legal; |

**Level 3 - Table-level permissions**

| \-- power_ceo: read all tables                                                  |
| ------------------------------------------------------------------------------- |
| GRANT SELECT ON ALL TABLES IN SCHEMA public TO power_CEO;                       |
|                                                                                 |
| \-- power_app: read and write                                                   |
| GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO power_app;       |
|                                                                                 |
| \-- power_analyst: read only                                                    |
| GRANT SELECT ON ALL TABLES IN SCHEMA public TO power_analyst;                   |
|                                                                                 |
| \-- power_ingestion: read and write for data loading                            |
| GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO power_ingestion; |
|                                                                                 |
| \-- power_team: read only                                                       |
| GRANT SELECT ON ALL TABLES IN SCHEMA public TO power_team;                      |
|                                                                                 |
| \-- power_ai: read only, no legal data                                          |
| GRANT SELECT ON ALL TABLES IN SCHEMA public TO power_ai;                        |
|                                                                                 |
| \-- power_legal: read only on matters and linked tables                         |
| GRANT SELECT ON ALL TABLES IN SCHEMA public TO power_legal;                     |

**5.7 Verifying All Permissions**

| SELECT grantee, privilege_type, table_name |
| ------------------------------------------ |
| FROM information_schema.role_table_grants  |
| WHERE table_schema = 'public'              |
| ORDER BY grantee, table_name;              |

This queries information_schema.role_table_grants - a built-in table PostgreSQL maintains automatically, recording every permission that has been granted. The results confirmed the correct permission structure for all eight accounts.

Chapter 6: Supabase Backend and Vercel Frontend

6.1 Why Supabase and Vercel

The backend platform is now Supabase rather than a separately assembled cloud stack. Supabase keeps PostgreSQL at the centre of the architecture while adding managed authentication, row-level security, storage, generated APIs, connection pooling, backups, and server-side functions. This removes the need to provision and operate separate cloud database, storage, identity, and server infrastructure during the build phase.

Vercel is selected for the frontend because it is purpose-built for Next.js deployment, provides automatic HTTPS, preview deployments, CDN delivery, environment variable management, and a straightforward Git-based release workflow. The combined Supabase + Vercel architecture is simpler to operate, cheaper to begin with, and better aligned with a Next.js application than the previous standalone cloud design.

6.2 Supabase PostgreSQL

Supabase PostgreSQL is the managed production database. Supabase provides a dedicated Postgres instance, connection pooling, backups, extension management, generated APIs, and dashboard administration. The project should start on a paid Supabase plan before production use, then increase compute and storage as data volume, concurrent users, and ingestion workload grow.

The database remains standard PostgreSQL, so local development, pg_dump backups, SQL migrations, Superset connections, and future portability remain available. Supabase row-level security policies should be treated as the primary enforcement layer for user-visible data access.

6.3 Backup and Disaster Recovery on Supabase

Supabase provides managed backups according to the selected plan, with longer retention and point-in-time recovery available on higher plans or add-ons. The platform backup must be supplemented by an independent encrypted pg_dump backup stored locally and on a secondary medium so the firm retains recoverability outside the hosted service.

6.4 Supabase Storage - Document Storage

Supabase Storage buckets will hold regulatory records, legal documents, ingestion files, exports, and AI-generated briefing notes. Recommended buckets are documents, ingestion-staging, and exports. Bucket policies and database metadata should enforce classification, retention, and access rules. If immutable retention is legally required, that requirement should be implemented through strict application controls and an additional archival backup process.

Documents are never publicly accessible. Access is via Supabase signed URLs or authenticated downloads controlled by Supabase policies. During the current build phase, signed URLs can be generated through the Supabase dashboard or a controlled admin script. Once the application layer is built, URL generation becomes automated inside the Next.js/Supabase backend flow. Links expire after a short period and no permanent public access is granted.

6.5 Frontend and Dashboard Access

The primary user interface will be a Next.js frontend deployed on Vercel and connected to Supabase for authentication, database access, storage, and server-side operations. Vercel provides HTTPS, preview deployments, and production hosting for the application. Apache Superset may still be used for internal analytical dashboards, but the main application experience is the Vercel-hosted Next.js site.

**Chapter 7: Physical Storage Infrastructure**

**7.1 Why Physical Storage Matters**

Supabase and Vercel provide reliable managed hosting, but exclusive dependence on hosted services introduces risk - particularly in Abuja where internet connectivity may be intermittent. Physical backups ensure data remains accessible and recoverable under all conditions including outages, billing issues, or account suspensions.

**7.2 Option 1 - Office Mini PC**

A small, low-power desktop computer (₦230,000-₦500,000) running PostgreSQL continuously in the office. An automated weekly backup pulls the full encrypted database from Supabase Postgres to this machine overnight via pg_dump scheduled in Windows Task Scheduler. Minimum spec: 16GB RAM, 1TB SSD. A UPS rated for two hours runtime is mandatory in Abuja (₦80,000-₦150,000).

| @echo off                                              |
| ------------------------------------------------------ |
| set DATE=%date:~10,4%-%date:~4,2%-%date:~7,2%          |
| pg_dump -h your-supabase-db-host.pooler.supabase.com ^ |
| \-U postgres ^                                         |
| \-d powerdata ^                                        |
| \-F c ^                                                |
| \-f C:\\Excredite\\Backups\\powerdata\_%DATE%.dump     |

| **Flag**      | **Meaning**                                                    |
| ------------- | -------------------------------------------------------------- |
| \-h           | The host address - your Supabase Postgres endpoint URL         |
| \-U postgres  | Connect as the postgres superuser                              |
| \-d powerdata | The database to back up                                        |
| \-F c         | Custom format - compressed, faster to restore than plain SQL   |
| \-f           | The output file path and name                                  |
| %DATE%        | Windows date variable - creates a dated filename automatically |

**7.3 Option 2 - NAS Device**

A Synology DS223 two-bay NAS with mirrored drives (\$300-\$400). Drives are written simultaneously - if one fails, the other keeps running and is replaced without data loss. Runs PostgreSQL natively. Best used alongside Option 1 to hold encrypted backup files in a redundant format.

**7.4 Option 3 - Data Centre Colocation (Abuja)**

Digital Realty ABV1, 23 Kolda Street, Wuse II, Abuja. Contact: digitalrealty.com. Professional power (N+1 UPS redundancy), physical security, and redundant fibre internet. Server hardware cost: \$200-\$500. Monthly hosting: \$50-\$150. Right long-term answer for production infrastructure.

**7.5 Option 4 - PostgreSQL Streaming Replication**

A built-in PostgreSQL feature sending database changes to a standby PostgreSQL server where supported by the selected Supabase plan and connection configuration. Near-zero data loss. Standby can become primary within minutes if the hosted database is unavailable. Requires careful network, replication, and security configuration. Most technically complex - appropriate for Year 2 once Options 1-3 are stable.

**7.6 Backup Access Control**

The backup file is a complete copy of all data. Access is restricted at the Windows folder level - only the administrator account that runs the backup and the database administrator can open the backup folder. The backup file is encrypted using 7-Zip with password protection immediately after creation. The raw .dump file is deleted after encryption. Without the password the file is unreadable even if physically copied. Only someone with the postgres or power_admin database credentials can restore from a backup.

**7.7 Recommended Implementation Path**

| **When**  | **Action**                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Now       | Buy mini PC + UPS. Configure automated weekly backup from Supabase.                                    |
| Month 3-6 | Add Synology NAS. Three physical copies now in place.                                                  |
| Year 1    | Contact Digital Realty ABV1. Move server to colocation facility.                                       |
| Year 2    | Evaluate Supabase-supported replication or managed standby options with a colocated PostgreSQL server. |

**Chapter 8: Security and Access Control**

**8.1 Three Security Levels**

Security operates at three independent levels. Each level remains in force regardless of the others.

| **Level**                      | **What It Controls**                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 - Database access            | Which users can connect, which schemas they can see, which tables they can read or write, and which rows they can see                                      |
| 2 - Supabase Auth and policies | Which users and services can access Supabase resources - authentication, RLS policies, service keys, and environment variables managed outside source code |
| 3 - Document access            | Documents in Supabase Storage are never publicly accessible - access is via time-limited signed URLs generated by the application                          |

**8.2 power_ceo Account**

The power_ceo account is assigned exclusively to Barrister Eyo Ekpo. It carries SELECT access across all tables and the BYPASSRLS privilege, giving him full and unrestricted visibility across all data on the platform - including any table to which row-level security policies are applied now or in the future. It is not a superuser account - superuser status remains reserved for power_admin and postgres only.

**8.3 power_legal Account**

All members of the legal team access the platform through a single shared power_legal account. This account is granted SELECT only on the matters table and relevant linked tables. Access control for legal matters is managed at the Superset dashboard level, which restricts visibility based on the logged-in user's Superset profile. Row-level security at the database level is not applied to this account as it cannot function correctly with a shared login.

Should the firm take on additional lawyers, no changes to the database structure are required. The shared power_legal account accommodates any number of legal team members.

**8.4 Document Access Control**

When the documents table is built, it will include a classification column with three levels: PUBLIC, INTERNAL, and LEGAL_PRIVILEGED. Row-level security policies will enforce visibility based on this classification - PUBLIC and INTERNAL documents will be accessible to authorised users; LEGAL_PRIVILEGED documents will be visible only to power_legal and power_ceo. Where a specific legal document must be shared with a non-legal user on a case-by-case basis, a time-limited Supabase signed URL is generated through the application and shared with the intended recipient. The link expires after a set period and no permanent permission changes are made. Note: the documents table has not yet been built. This is the confirmed design for when it is.

**Chapter 9: Dashboard Layer**

**9.1 Apache Superset**

Apache Superset is a free, open-source data visualisation tool. It connects directly to the PostgreSQL database and allows users to create charts, tables, and dashboards through a visual interface without writing code. SQL Lab provides a direct query editor for advanced users. It is self-hosted in a Docker container - data never leaves the firm's own infrastructure.

Superset has its own internal role system - Admin, Alpha, Gamma, and SQL Lab - that controls what each user can see and do within the dashboard interface. This is separate from the PostgreSQL user accounts. The two systems work together but are configured independently.

**9.2 The Five Dashboards**

| **Dashboard**                | **Audience**         | **Content**                                                                                                                                                                                                                |
| ---------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| National Grid KPI            | All authorised staff | Previous day's generation figures, capacity utilisation, curtailment by cause, plant performance vs historical norm. Based on most recently loaded TCN daily report - current to the previous calendar day, not real time. |
| Tariff and Revenue Analytics | Analysts, advisors   | MYTO history across all 11 DISCOs and 5 customer bands, cost-reflective tariff gap, 12-month AI forecast                                                                                                                   |
| Regulatory Actions Tracker   | All authorised staff | Every NERC enforcement action - fines, licences, directives, investigations - searchable and filterable, linked to source documents                                                                                        |
| Legal Matters Monitor        | Legal team only      | Active litigation, arbitration, advisory matters, deadlines, lead counsel, linked documents. Restricted via Superset role - legal team only.                                                                               |
| Executive Summary            | Senior leadership    | Single-screen daily overview combining key indicators from all other dashboards plus latest AI alerts and briefing note                                                                                                    |

**Chapter 10: Artificial Intelligence Layer**

**10.1 Architecture**

The AI layer runs as a separate Docker service. LangChain (Python) orchestrates connections between the database, document search system, and Claude API. The AI service connects through the power_ai account - SELECT only, no access to legal or client-confidential data. The only tables the AI writes to are its own artefact tables: conversation_log, anomaly_alerts, and forecasts.

**10.2 Natural Language Querying**

A user types a question in plain English. The AI translates it into SQL, runs it using the power_ai account, and returns the result with a plain-English explanation. Every query is logged in the conversation_log table for audit purposes. The AI is instructed strictly to write only SELECT queries - never INSERT, UPDATE, or DELETE.

**10.3 Document Q&A**

When a document is loaded, the pipeline breaks it into 500-word chunks and converts each chunk into a vector embedding using pgvector. When a user asks a question, the system finds the most relevant chunks and passes them to Claude, which generates a grounded answer citing specific parts of the document. The model cannot invent information - it can only answer based on what is in the document. Note: pgvector has not yet been installed. It is deferred to the AI build phase.

**10.4 Anomaly Detection**

Every morning after the previous day's generation data has been loaded - manually during the build phase, automatically via Airflow once that pipeline is complete - an automated process checks every active plant's output against its 30-day rolling average and standard deviation. Output more than three standard deviations from the norm triggers an alert in the anomaly_alerts table. A statistical approach is used rather than machine learning because it is transparent and explainable - the reason for each alert can be stated precisely.

**10.5 Predictive Forecasting**

Two forecasts are generated weekly. The national generation forecast uses Facebook Prophet, a free open-source time-series library from Meta that handles seasonality automatically. Because fifteen years of historical TCN data will be loaded from 2010, the model will be reliable from day one of deployment. The tariff trajectory model uses gradient-boosting regression trained on MYTO data with macroeconomic inputs - inflation rate, exchange rate, gas prices, DISCO collection efficiency. These inputs require their own data pipeline to be kept current.

**10.6 AI-Generated Briefing Notes**

A user selects a subject. The system pulls relevant quantitative data from the database, retrieves supporting document excerpts via vector search, and instructs Claude to write a structured briefing note in six sections: headline summary, key metrics, analysis, regulatory context, implications and recommendations, and data sources. The note is converted to PDF, stored in Supabase Storage, registered in the documents table, and made available for download.

**Chapter 11: Data Ingestion**

**11.1 Apache Airflow**

Apache Airflow orchestrates all data loading jobs as scheduled tasks called DAGs (Directed Acyclic Graphs). It can be self-hosted in Docker during the build phase. As the ingestion workload grows, scheduled ingestion may remain in Airflow or move into Supabase Edge Functions, Vercel scheduled functions, or another managed scheduler depending on reliability, runtime limits, and operational cost.

**11.2 Data Sources**

| **Source**          | **Data**                                                   | **Frequency** | **Access Method**                         |
| ------------------- | ---------------------------------------------------------- | ------------- | ----------------------------------------- |
| TCN System Operator | Daily generation reports - output per plant                | Daily         | PDF download - requires processing script |
| NERC                | Regulatory orders, enforcement actions, licence records    | Weekly        | Website scraping - format varies          |
| NBET                | Monthly market settlement data, gas cost components        | Monthly       | May require formal access request         |
| NNPC                | Gas supply volumes, nominations vs deliveries              | Monthly       | Formal access request required            |
| NDPRA               | Gas allocation, supply interruptions, pipeline constraints | Monthly       | Formal access request required            |
| World Bank / IEA    | Cross-country benchmarking data                            | Quarterly     | Publicly available downloads              |
| Client-supplied     | Billing records, metering data, internal reports           | Ad hoc        | Direct submission                         |

Data from Nigerian regulatory bodies is not always published in machine-readable formats. TCN daily reports are PDFs whose layout has changed several times historically. NBET settlement data and NNPC/NDPRA gas data may require formal written access requests. The ingestion pipeline must be built with format flexibility and error tolerance as core requirements. This data wrangling work is the most labour-intensive and unpredictable component of the entire project.

**11.3 Five-Step Load Process**

1\. Extraction - download or receive the raw file

2\. Validation - check format, plausible value ranges, no unexpected nulls or duplicates

3\. Transformation - convert units, resolve organisation names to database UUIDs, standardise date formats

4\. Loading - insert clean data into the appropriate tables

5\. Auditing - write a provenance record, log row counts for the job

If any step fails, Airflow retries automatically and sends an alert if failure persists.

**Chapter 12: Application Layer**

**12.1 What the Application Layer Is**

The application layer sits between the database and the users. It handles authentication, generates Supabase Storage signed URLs, serves data where business logic is required, and routes natural language queries to the AI layer. It will be built primarily in Next.js and deployed on Vercel, using Supabase for backend services such as Auth, Postgres, Storage, RLS, and server-side functions where appropriate.

**12.2 Build Sequence**

1\. Authentication endpoints - verify credentials, issue tokens

2\. Document URL generation - receive document ID, return time-limited Supabase Storage URL

3\. Data endpoints for dashboards - serve data where row-level logic is required

4\. AI gateway - receive natural language question, return SQL result and explanation

Each piece is independently useful. Authentication and document URL generation should be faster because Supabase provides the backend primitives. Data endpoints, dashboard-specific business logic, and the AI gateway realistically take two to three months of part-time work.

**Chapter 13: Infrastructure Cost**

**13.1 Monthly Cloud Cost Breakdown**

| **Service**                     | **Low Estimate** | **High Estimate** | **Notes**                                                                   |
| ------------------------------- | ---------------- | ----------------- | --------------------------------------------------------------------------- |
| Supabase Pro + database compute | \$25             | \$150             | Starts at Supabase Pro; increases with compute, storage, backups, and usage |
| Vercel Pro                      | \$20             | \$100             | Hosts the Next.js frontend and serverless application logic                 |
| Anthropic Claude API            | \$50             | \$200             | Variable - scales with AI feature usage. No free tier.                      |
| Supabase Storage                | \$0              | \$25              | Included quota first; overage grows with stored documents and bandwidth     |
| OCR / PDF extraction            | \$0              | \$50              | Depends on selected OCR approach and document ingestion volume              |
| Data transfer and overages      | \$0              | \$25              | Depends on Supabase/Vercel bandwidth, storage, and function usage           |
| TOTAL                           | \$95             | \$550             | Excludes physical hardware                                                  |

Note: Supabase and Vercel both provide free tiers suitable for experimentation and early prototypes, but production use should be budgeted on paid plans once meaningful data volumes, automated ingestion, storage, and concurrent users are introduced. All open-source components - PostgreSQL, TimescaleDB, Superset, Airflow, LangChain, Next.js, Docker, pgvector, and Prophet - remain free with no licence restrictions at any scale.

**13.2 Physical Storage Costs**

| **Item**                             | **One-Time Cost**   | **Monthly Cost**      |
| ------------------------------------ | ------------------- | --------------------- |
| Mini PC + UPS (office)               | ₦350,000 - ₦500,000 | ₦0 (electricity only) |
| NAS Device - Synology DS223 + drives | \$300 - \$400       | ₦0 (electricity only) |
| 1U Rack Server for colocation        | \$200 - \$500       | \$50 - \$150          |
| Streaming replication configuration  | ₦0                  | ₦0                    |
| Domain name (optional)               | \$10 - \$15/year    | -                     |
| TOTAL (full path)                    | ~₦700k + ~\$750     | \$50 - \$150/month    |

**Chapter 14: Q&A Record - All Markup Questions and Answers**

This chapter records every question raised during the build process and the answer given. Questions are presented in the order they were raised.

| **Q: We retain the local data as backup, updated periodically - how?**                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: A pg_dump batch file runs via Windows Task Scheduler - weekly during early build, daily once generation ingestion is live. Each backup is encrypted with 7-Zip and stored locally with a secondary copy on external drive or cloud storage. Only users with postgres or power_admin credentials can restore from a backup. |

| **Q: Can the backup file be accessed by all users or just those with special privileges?**                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: The backup folder is restricted at the Windows level - only the administrator account and the database administrator can access it. The file is encrypted and unreadable without the password. Only someone with postgres or power_admin credentials can restore it into a live database. No other user account has the database privileges required to perform a restoration. |

| **Q: Is there a way to have physical database storage other than the local device?**                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Yes - four options: an office mini PC, a NAS device with mirrored drives, colocation at Digital Realty ABV1 in Wuse II Abuja, or PostgreSQL streaming replication. The recommended approach implements them in sequence: mini PC now, NAS at month 3-6, colocation in Year 1, streaming replication in Year 2. |

| **Q: Is there a data centre in Abuja?**                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Yes. Digital Realty ABV1 at 23 Kolda Street, Off Adetokunbo Ademola, Wuse II, Abuja. Operated by Digital Realty - one of the largest data centre companies in the world. Provides N+1 UPS redundancy, redundant cooling, and direct access to the Nigeria Internet Exchange Point. Contact: digitalrealty.com. |

| **Q: How far back does the historical data go?**                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: Minimum 15 years - back to 2010. This covers generation output, tariff determinations from the first MYTO in 2008, and NERC regulatory actions. Barrister Ekpo holds additional historical records not yet reviewed. Once assessed, coverage may extend further back. The database places no constraint on how far back records can be dated. |

| **Q: Can the current database design handle data going back further than 2010?**                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Yes, without any changes. The states table is unaffected - Nigeria's 36-state structure has been in place since 1996. The organisations table handles historical entities like NEPA and PHCN through its status and deleted_at columns. The generation output table stores rows with any timestamp. The tariff tables accommodate pre-MYTO records. The only preparation needed is registering dissolved organisations in the organisations table before loading data that references them. |

| **Q: Is TCN data loading automated or manual?**                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Manual during the build phase - a designated team member downloads the TCN daily report, processes it through the ingestion script, validates the output, and triggers the load. Automated once the Apache Airflow pipeline is built and tested. The anomaly detection process fires automatically after each successful load regardless of whether loading was manual or automated. |

| **Q: How will the application layer be built?**                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Using Next.js deployed on Vercel for the frontend and application layer, with Supabase providing Auth, Postgres, Storage, RLS, and backend functions where appropriate. Built in four pieces in sequence: authentication, document URL generation, data endpoints for dashboards, and AI gateway. Authentication and document URL generation should be faster because Supabase provides those backend primitives. Data endpoints and AI gateway take two to three months part-time. |

| **Q: What does 'a secured public address accessible from anywhere with valid login credentials' mean?**                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Superset is served on an HTTPS URL reachable over the internet from any device. HTTPS encrypts all data in transit via an SSL certificate. The login page requires a valid username and password. Adding Multi-Factor Authentication is strongly advisable. The URL looks like <https://dashboard.excredite.com> if a custom domain is registered - approximately \$10-\$15 per year. |

| **Q: Is there any upfront cost for the services used?**                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Yes for hardware: mini PC, UPS, NAS device, and rack server all require upfront purchase. A domain name costs \$10-\$15 per year. All software - PostgreSQL, TimescaleDB, Superset, Airflow, LangChain, Next.js, Docker, pgvector, Prophet - is completely free. Supabase, Vercel, selected OCR services, and Anthropic API require a payment method registered but no upfront payment - charged monthly based on usage. |

| **Q: How does Superset enforce role-based access?**                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: Superset has its own internal roles - Admin, Alpha, Gamma, SQL Lab - controlling what users can see and do in the dashboard interface. This is separate from PostgreSQL roles. Superset connects to PostgreSQL using shared service credentials (power_analyst or power_app). The Legal Matters Monitor is restricted to the power_legal Superset profile. For sensitive data requiring individual-level access control, the application layer API handles queries using individual database credentials. |

| **Q: Is there a way to merge database roles with Superset's roles?**                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: Yes - via LDAP or OAuth 2.0. LDAP uses a central directory (Microsoft Active Directory) that both systems authenticate against. OAuth allows Superset login using existing Microsoft credentials. However both add significant complexity. Recommendation: do not attempt during the current build phase. Revisit in Year 2. For now, a naming convention and management script that updates both systems simultaneously is sufficient. |

| **Q: What was the verdict on power_legal and row-level security?**                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: All legal team members share a single power_legal account. Row-level security cannot function correctly with a shared login and has been removed from the design entirely. Access control for legal matters is managed at the Superset dashboard level. Barrister Ekpo uses power_ceo which carries BYPASSRLS for full visibility. Should the firm take on additional lawyers, the shared account accommodates them with no structural changes required. |

| **Q: power_CEO - should it be a superuser?**                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: No. A superuser can delete tables, modify security policies, and damage the database infrastructure. Barrister Ekpo needs full data visibility, not administrative control. The correct designation is a privileged read account with BYPASSRLS. Command: ALTER USER power_ceo BYPASSRLS; |

| **Q: Does the document contradict itself on forecasting reliability?**                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Yes - the original document said the forecasting model becomes reliable after two years of accumulated data, but also said 15 years of historical data would be loaded. This was corrected in the revised document. Because 15 years of TCN data from 2010 will be loaded before deployment, the forecasting model is reliable from day one. |

**Chapter 15: Problems Encountered and Solutions**

This chapter records every technical problem encountered during the build and the solution applied. It serves as a troubleshooting reference for future build sessions.

**Problem 1 - pgAdmin Query Tool copy-paste corruption**

Symptom: Copying multi-line SQL commands from a document and pasting into pgAdmin's Query Tool produced errors such as 'type modifier not allowed' and 'syntax error at or near'. The SQL appeared correct visually.

Cause: pgAdmin introduced invisible formatting characters - line breaks and whitespace - when text was pasted from external sources. These characters corrupted the SQL structure invisibly.

Solution: For complex multi-line commands, use the Windows terminal (psql) instead of pgAdmin. For simple single-line commands, pgAdmin works reliably. Alternatively, type commands manually in pgAdmin rather than pasting.

**Problem 2 - ERROR: role 'power_ceo' does not exist**

Symptom: Running GRANT commands for power_CEO returned ERROR: role 'power_ceo' does not exist.

Cause: The GRANT command was run before the CREATE USER command. PostgreSQL cannot grant permissions to a user that does not exist.

Solution: Always CREATE USER first, then run GRANT commands. Verify users exist with: SELECT usename FROM pg_user ORDER BY usename;

**Problem 3 - ERROR: column 'usecreaterole' does not exist**

Symptom: Running SELECT usename, usesuper, usecreatedb, usecreaterole FROM pg_user returned an error on the usecreaterole column.

Cause: The column name changed in PostgreSQL 18.

Solution: Remove usecreaterole from the query. Use: SELECT usename, usesuper, usecreatedb FROM pg_user ORDER BY usename;

**Problem 4 - pgvector extension not available**

Symptom: CREATE EXTENSION IF NOT EXISTS vector returned 'extension not available'.

Cause: pgvector is not bundled with the PostgreSQL 18 Windows installer. It requires a separate download and manual installation.

Solution: Deferred to the AI build phase. When ready, download pgvector from github.com/pgvector/pgvector/releases and place the files in C:/PROGRA~1/POSTGR~1/18/lib. Then run CREATE EXTENSION vector;

Problem 5 - the earlier cloud option rejected for TimescaleDB

Symptom: Initial plan assumed a traditional cloud infrastructure provider. The architecture has since changed because Supabase now provides the backend services and Vercel will host the Next.js frontend, making the earlier standalone cloud infrastructure unnecessary for the current build.

Cause: The backend and deployment plan changed. Supabase now provides the managed backend layer and Vercel hosts the Next.js frontend, so the previous standalone cloud-provider decision is no longer the controlling architecture.

Solution: The architecture has been revised to Supabase for the backend and Vercel for the Next.js frontend. This removes the need for the earlier standalone cloud infrastructure design and is documented in Chapter 6 of the technical document.

**Problem 6 - Document technical inconsistencies identified**

Several technical inconsistencies were identified in the project document during review:

• 'Near real-time' claim in the Grid KPI Dashboard - corrected to 'previous day's data from the TCN daily report'

• AI service had no dedicated database user - power_ai account added to the design

• Row-level security promised for power_legal but not implementable with a shared account - row-level security removed, access control moved to Superset dashboard level

• power_ceo described as read-only - updated to SELECT + BYPASSRLS, exclusively assigned to Barrister Ekpo

• pgvector presented as installed - corrected to deferred

• Forecasting reliability contradiction - corrected: 15 years of historical data loaded at deployment means model is reliable from day one

• db.t3.large presented as sufficient for full production - corrected to a starting point requiring review at 6 months

• Chapter 10 cost claim that all components are free - corrected: open-source components are free; Supabase, Vercel, selected OCR services, and Claude API are pay-as-you-use from serious deployment

**Problem 7 - Sessions lost from chat interface**

Symptom: Some conversation history disappeared from the chat interface during the project.

Cause: Claude has no persistent memory between sessions. The chat interface may also compress or truncate long conversation histories.

Solution: Maintain a local project log document updated after every session. Copy all commands, results, and decisions into the log before ending any session. This master document serves as the permanent record going forward.

**END OF DOCUMENT**

_Excredite Consulting - Excredite Power Data Hub - Master Technical Documentation - 2026_