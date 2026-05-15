**EXCREDITE CONSULTING**

**EXCREDITE POWER DATA HUB**

**Frontend Requirements Document**

_For the AI Query Interface and User Portal_

Prepared for: Frontend Developer

This document is the complete requirements specification for the frontend layer of the Excredite Power Data Hub platform. It is written for the developer who will build the web interface through which users query the AI, access the database, and interact with the platform. It covers what the system does, who uses it, what pages need to be built, how they connect to the backend, and what the developer needs to know before starting work.

Read this document in full before writing a single line of code. If anything is unclear, raise it before starting - changes to requirements mid-build cost more time than clarifying upfront.

**Chapter 1: Project Overview**

**1.1 What Is Being Built**

The Excredite Power Data Hub (EPDH) is a centralised analytics and intelligence platform for Nigeria's electricity sector. It holds decades of power sector data - generation output, tariff history, regulatory enforcement actions, gas supply figures, transmission statistics, and legal matters. An artificial intelligence layer sits on top of this database and allows users to query it in plain English, receive data-backed answers, generate briefing notes, and be alerted to unusual patterns in the data.

The frontend developer's job is to build the web interface through which users interact with the AI and the database. The database, AI layer, and backend API already exist or are being built separately. The frontend connects to them.

**1.2 What the Frontend Is NOT**

The frontend is not the database. It is not the AI. It does not store data. It does not run queries directly against PostgreSQL. It communicates with a backend API - built in FastAPI - which handles all database and AI operations. The frontend sends requests to the API and displays whatever the API returns.

_Think of the frontend as the face of the platform. The backend is the brain. The frontend asks questions; the backend does the work and sends back answers._

**1.3 The Technology Stack**

| **Component**      | **Details**                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| Backend API        | FastAPI (Python) - to be built in Phase 2, after the database is complete            |
| Database           | PostgreSQL 18 with TimescaleDB - hosted on AWS RDS                                   |
| AI Model           | Anthropic Claude API - accessed via the backend, never directly from the frontend    |
| Document Storage   | Amazon S3 - documents accessed via pre-signed URLs from the backend                  |
| Hosting            | AWS EC2 - the frontend will be deployed on an AWS server                             |
| Frontend framework | Developer's choice - React is recommended but not mandatory                          |
| Styling            | Developer's choice - keep it clean, professional, and fast-loading                   |
| Authentication     | JWT tokens issued by the backend - frontend stores and sends them with every request |

**1.4 Guiding Principles**

• Simple over complex. Users are energy lawyers, analysts, and advisors - not software engineers. Every interaction must be intuitive without training.

• Fast over feature-rich. A response that loads in two seconds is worth more than ten features that load in ten seconds.

• Mobile-aware. Some users will access the platform on a phone or tablet. The interface must be usable on smaller screens even if it is not fully optimised for mobile.

• Honest about loading states. AI responses take several seconds. Never leave the user staring at a blank screen - show a loading indicator immediately.

• Error-friendly. When something fails, tell the user what happened in plain English. Never show a raw error code or stack trace.

**Chapter 2: Users and Access Levels**

**2.1 Who Uses the Platform**

| **User Type**           | **Database Account**   | **What They Need**                                                                        |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| Chief Executive Officer | power_ceo              | Full access to all data including legal matters. Executive summary view. AI query access. |
| Research Analysts       | power_analyst          | Access to all sector data dashboards. Full AI query capability. No legal matters.         |
| General Staff           | power_team             | Read-only access to general dashboards. Limited AI query access.                          |
| Legal Team              | power_legal            | Access to legal matters interface. Document Q&A. No access to other users' matters.       |
| AI Service              | power_ai               | Backend only - never logs in through the frontend. Do not build a login for this account. |
| External Subscribers    | power_public (planned) | Access to curated public data views only. Separate portal - not required in this phase.   |

_The frontend does not manage user accounts or passwords. User creation and permission management is handled entirely by the database administrator. The frontend only handles login - it sends credentials to the backend and receives a token in return._

**2.2 Authentication Flow**

The login process works as follows:

1\. User enters username and password on the login page

2\. Frontend sends credentials to the backend API login endpoint

3\. Backend verifies credentials against the database

4\. Backend returns a JWT token if credentials are valid

5\. Frontend stores the token in memory or secure storage

6\. Every subsequent API request includes the token in the Authorization header

7\. Token expires after a set period - user is redirected to login

| // Example API request with token                |
| ------------------------------------------------ |
| fetch('/api/query', {                            |
| method: 'POST',                                  |
| headers: {                                       |
| 'Content-Type': 'application/json',              |
| 'Authorization': 'Bearer ' + token               |
| },                                               |
| body: JSON.stringify({ question: userQuestion }) |
| })                                               |

**Chapter 3: Pages to Build**

**3.1 Page List**

| **Page**                  | **Route**   | **Priority**                                        |
| ------------------------- | ----------- | --------------------------------------------------- |
| Login                     | / or /login | Must have - build first                             |
| AI Query Interface        | /query      | Must have - core feature                            |
| Conversation History      | /history    | Must have                                           |
| Briefing Note Generator   | /briefing   | Must have                                           |
| Anomaly Alerts            | /alerts     | Must have                                           |
| Document Upload and Q&A   | /documents  | Must have                                           |
| Forecasts                 | /forecasts  | Must have                                           |
| Legal Matters             | /matters    | Must have - restricted to power_legal and power_ceo |
| User Profile and Settings | /profile    | Should have                                         |
| 404 Not Found             | /404        | Must have                                           |

**3.2 Login Page**

**Purpose**

The entry point for all users. Simple, clean, professional. No registration - accounts are created by the administrator.

**Required elements**

• Excredite logo at the top

• Username field

• Password field with show/hide toggle

• Login button

• Error message area - displayed clearly if credentials are wrong

• No 'forgot password' link - password resets are handled by the administrator

**Behaviour**

• On successful login - redirect to the AI Query Interface

• On failed login - display 'Invalid username or password' in plain English

• On network error - display 'Unable to connect. Please check your connection and try again'

• Disable the login button while a request is in progress to prevent double submission

**3.3 AI Query Interface**

**Purpose**

The most important page on the platform. Users type a question in plain English and receive a data-backed answer from the AI. This is the primary way users interact with the database.

**Required elements**

• A large, prominent text input area where the user types their question

• A submit button labelled 'Ask' or 'Query'

• A response area where the AI answer is displayed

• A loading indicator - visible immediately after the user submits, before the response arrives

• A 'Copy answer' button on each response

• A 'Download as PDF' button on each response for saving briefing-style answers

• A conversation thread - questions and answers displayed in order, most recent at the bottom

• A 'New conversation' button to clear the thread and start fresh

**Example questions the interface must handle**

• What was the total generation output last week?

• Which DISCO had the highest ATC&C losses in 2025?

• Show me all NERC enforcement actions from the last six months

• What is the gas supply shortfall for Egbin plant this month?

• Generate a briefing note on tariff changes since 2020

**Behaviour**

• Submit on Enter key or button click

• Disable the input while a response is loading - prevent sending a second query before the first returns

• Display the question immediately in the thread before the response arrives

• Stream the response if the backend supports streaming - display words as they arrive rather than waiting for the full response

• If the AI cannot answer - display the explanation it returns, never a blank response

• Scroll to the latest response automatically

**API endpoint**

| POST /api/query                                          |
| -------------------------------------------------------- |
| {                                                        |
| "question": "What was total generation last week?"       |
| }                                                        |
|                                                          |
| Response:                                                |
| {                                                        |
| "answer": "Total generation last week was 4,832 MWh...", |
| "sql_used": "SELECT SUM(actual_output_mwh)...",          |
| "conversation_id": "uuid"                                |
| }                                                        |

**3.4 Conversation History**

**Purpose**

A log of all previous AI queries made by the logged-in user. Users can review past questions and answers, resume a conversation, or copy a previous answer.

**Required elements**

• List of previous conversations, each showing the first question and the date

• Click to expand and view the full conversation thread

• Search bar to filter conversations by keyword

• Delete button on each conversation

**API endpoint**

| GET /api/conversations                      |
| ------------------------------------------- |
| GET /api/conversations/{conversation_id}    |
| DELETE /api/conversations/{conversation_id} |

**3.5 Briefing Note Generator**

**Purpose**

A dedicated page for generating structured, formal briefing notes. Different from the general AI query interface - the output here is always a formatted document rather than a conversational answer.

**Required elements**

• Subject input - a text field where the user describes the topic

• Date range selector - from date and to date

• Optional - a dropdown to select which data categories to include (generation, tariffs, regulatory actions, gas supply)

• Generate button

• Preview area - the briefing note displayed on screen before download

• Download as PDF button

• Save to documents button - stores the note in the platform document registry

**Behaviour**

• Generation takes longer than a standard query - show a progress message such as 'Compiling data...' then 'Drafting note...' then 'Formatting document...'

• The preview renders the six sections: Headline Summary, Key Metrics, Analysis, Regulatory Context, Implications and Recommendations, Data Sources

**API endpoint**

| POST /api/briefing                                   |
| ---------------------------------------------------- |
| {                                                    |
| "subject": "NERC enforcement actions Q1 2026",       |
| "date_from": "2026-01-01",                           |
| "date_to": "2026-03-31",                             |
| "categories": \["regulatory_actions", "generation"\] |
| }                                                    |
|                                                      |
| Response:                                            |
| {                                                    |
| "briefing_text": "...",                              |
| "pdf_url": "<https://s3.../briefing-uuid.pdf>"       |
| }                                                    |

**3.6 Anomaly Alerts**

**Purpose**

A page showing all AI-generated anomaly alerts. The backend generates these automatically every morning after loading the previous day's generation data. Users review them here.

**Required elements**

• List of alerts, most recent first

• Each alert shows: plant name, alert date, deviation amount, and the AI explanation

• Filter by date range and by plant

• Mark as reviewed button on each alert

• Unreviewed alerts shown prominently - reviewed alerts greyed out

**API endpoint**

| GET /api/alerts                     |
| ----------------------------------- |
| GET /api/alerts?status=unreviewed   |
| PATCH /api/alerts/{alert_id}/review |

**3.7 Document Upload and Q&A**

**Purpose**

Users upload regulatory documents - NERC orders, court judgments, MYTO determinations, policy papers - and ask the AI questions about them. The AI answers based only on the document content.

**Required elements**

• Document upload area - drag and drop or file picker. PDF only.

• Uploaded documents list - title, date uploaded, classification (PUBLIC, INTERNAL, LEGAL_PRIVILEGED)

• Document viewer - renders the PDF in the browser

• Question input below the document - same style as the main query interface

• Answer area - AI response grounded in the document content

• Citation indicators - highlights or references to the specific part of the document the answer came from

**Behaviour**

• Maximum file size: 50MB per document

• Only PDF files accepted - reject other formats with a clear error message

• Show upload progress for large files

• Processing takes time - Textract must extract the text and embeddings must be generated. Show a 'Processing document...' state. The document is not queryable until processing is complete.

**API endpoints**

| POST /api/documents/upload                       |
| ------------------------------------------------ |
| GET /api/documents                               |
| GET /api/documents/{document_id}                 |
| POST /api/documents/{document_id}/query          |
| {                                                |
| "question": "What penalty was imposed on IKEDC?" |
| }                                                |

**3.8 Forecasts**

**Purpose**

Displays the AI-generated generation and tariff forecasts. Updated weekly by the backend. Users view the forecast charts and download the underlying data.

**Required elements**

• Forecast type selector - generation output or tariff trajectory

• Plant selector for generation forecasts - filter by specific plant or view national aggregate

• Chart - line graph showing historical data and forecast with confidence interval band

• Forecast horizon toggle - 30 days or 90 days

• Download forecast data as CSV button

• Last updated timestamp - when the forecast was generated

**Chart requirements**

• Historical data in solid line

• Forecast in dashed line

• Confidence interval as a shaded band around the forecast line

• Clear axis labels - dates on x-axis, MWh or Naira per kWh on y-axis

• Responsive - renders correctly on all screen sizes

**API endpoint**

| GET /api/forecasts?type=generation&plant_id=uuid&horizon=30 |
| ----------------------------------------------------------- |
| GET /api/forecasts?type=tariff&horizon=90                   |

**3.9 Legal Matters**

**Purpose**

A case management interface for the legal team. Displays active matters, linked documents, deadlines, and lead counsel assignments. Restricted to users with the power_legal database account and power_ceo.

**Required elements**

• List of active matters - matter reference, client name, matter type, status, lead counsel, next deadline

• Matter detail view - full information on a selected matter including linked documents

• Document viewer - opens linked documents from S3

• Status filter - ACTIVE, CLOSED, ON_HOLD

• Search by client name or matter reference

**Access control**

This page must only be visible to users whose backend token identifies them as power_legal or power_ceo. For all other users, the page must not appear in the navigation and must return a 403 error if accessed directly by URL.

_The backend enforces this restriction - the frontend must also enforce it in the navigation and routing to prevent confusion, but it must not rely on the frontend alone for security._

**API endpoint**

| GET /api/matters                       |
| -------------------------------------- |
| GET /api/matters/{matter_id}           |
| GET /api/matters/{matter_id}/documents |

**Chapter 4: Navigation and Layout**

**4.1 Navigation Structure**

The navigation must reflect what each user is permitted to see. The backend returns the user's role in the login response - use this to show or hide navigation items.

| **Navigation Item**  | **Route**  | **Visible To**              |
| -------------------- | ---------- | --------------------------- |
| AI Query             | /query     | All logged-in users         |
| Conversation History | /history   | All logged-in users         |
| Briefing Notes       | /briefing  | All logged-in users         |
| Anomaly Alerts       | /alerts    | power_ceo, power_analyst    |
| Documents            | /documents | All logged-in users         |
| Forecasts            | /forecasts | All logged-in users         |
| Legal Matters        | /matters   | power_legal, power_ceo only |
| Profile              | /profile   | All logged-in users         |
| Logout               | -          | All logged-in users         |

**4.2 Layout**

• Sidebar navigation on desktop - fixed on the left, collapsible

• Top bar navigation on mobile - hamburger menu

• Main content area fills remaining space

• Excredite logo in the top left at all times

• Logged-in username displayed in the top right

• Logout button always accessible

**4.3 Colour and Typography**

The platform uses a neutral, professional colour scheme. No bright colours. The interface should feel like a serious analytical tool, not a consumer app.

• Primary background: white or very light grey

• Text: dark grey or black

• Accent: a single muted colour for buttons and active states - match the Excredite brand colours if provided

• Font: a clean sans-serif - Inter, IBM Plex Sans, or similar

• Font size: minimum 14px for body text - this platform is used for reading and analysis

**Chapter 5: API Reference**

**5.1 Base URL**

| Development: <http://localhost:8000>          |
| --------------------------------------------- |
| Production: <https://api.excredite.com> (TBC) |

**5.2 Authentication**

| POST /api/auth/login                                                           |
| ------------------------------------------------------------------------------ |
| Body: { "username": "string", "password": "string" }                           |
| Response: { "token": "jwt-string", "role": "power_analyst", "name": "string" } |
|                                                                                |
| All other endpoints require:                                                   |
| Header: Authorization: Bearer {token}                                          |

**5.3 Core Endpoints Summary**

| **Method + Endpoint**          | **Purpose**                 | **Returns**                           |
| ------------------------------ | --------------------------- | ------------------------------------- |
| POST /api/auth/login           | User login                  | JWT token + role                      |
| POST /api/query                | Submit AI query             | Answer + SQL used                     |
| GET /api/conversations         | List past conversations     | Array of conversation summaries       |
| GET /api/conversations/{id}    | Get full conversation       | Full Q&A thread                       |
| DELETE /api/conversations/{id} | Delete conversation         | Confirmation                          |
| POST /api/briefing             | Generate briefing note      | Briefing text + PDF URL               |
| GET /api/alerts                | List anomaly alerts         | Array of alerts                       |
| PATCH /api/alerts/{id}/review  | Mark alert reviewed         | Confirmation                          |
| POST /api/documents/upload     | Upload document             | Document ID + processing status       |
| GET /api/documents             | List documents              | Array of document metadata            |
| POST /api/documents/{id}/query | Ask question about document | AI answer with citations              |
| GET /api/forecasts             | Get forecast data           | Forecast array with confidence bounds |
| GET /api/matters               | List legal matters          | Array of matter summaries             |
| GET /api/matters/{id}          | Get matter detail           | Full matter record                    |
| GET /api/user/profile          | Get logged-in user profile  | User details and role                 |

**5.4 Error Handling**

The backend returns standard HTTP status codes. The frontend must handle all of them gracefully.

| **Status Code**       | **What to display to the user**                                               |
| --------------------- | ----------------------------------------------------------------------------- |
| 200 OK                | Normal - display the response                                                 |
| 400 Bad Request       | 'Your request could not be processed. Please check your input and try again.' |
| 401 Unauthorised      | Redirect to login page. Clear stored token.                                   |
| 403 Forbidden         | 'You do not have permission to access this.'                                  |
| 404 Not Found         | 'The requested item could not be found.'                                      |
| 429 Too Many Requests | 'You are sending requests too quickly. Please wait a moment and try again.'   |
| 500 Server Error      | 'Something went wrong on our end. Please try again in a few minutes.'         |
| Network Error         | 'Unable to connect to the server. Please check your internet connection.'     |

**Chapter 6: Technical Requirements**

**6.1 Browser Support**

• Chrome - latest two versions

• Edge - latest two versions

• Firefox - latest two versions

• Safari - latest two versions

• Mobile Chrome and Safari - functional, not necessarily fully optimised

**6.2 Performance**

• Initial page load under three seconds on a standard office connection

• AI query responses begin displaying within one second of submission - loading indicator shown immediately

• No full page reloads for navigation - use client-side routing

• Lazy load pages that are not immediately needed

**6.3 Security**

• Never store the JWT token in localStorage - use sessionStorage or an in-memory store to reduce XSS risk

• Never send database credentials from the frontend - all database access goes through the backend API

• Never construct SQL queries in the frontend - queries are generated by the AI layer on the backend

• Sanitise all user input before displaying it to prevent XSS

• HTTPS only in production - never allow HTTP connections

• Implement a session timeout - redirect to login after 30 minutes of inactivity

**6.4 Accessibility**

• All interactive elements must be keyboard navigable

• All images must have alt text

• Colour is never the only way to convey information

• Minimum contrast ratio of 4.5:1 for body text

**6.5 Deployment**

• The frontend will be deployed as a static build on AWS EC2 or AWS S3 + CloudFront

• The developer must provide a production build that can be deployed without a Node.js server

• Environment variables must be used for the API base URL - never hardcode it

• The build process must be documented clearly so the database administrator can redeploy independently

**Chapter 7: What to Deliver**

**7.1 Deliverables**

1\. Complete source code in a GitHub repository with a clear folder structure

2\. A README file explaining how to install, run locally, and build for production

3\. A .env.example file listing all required environment variables

4\. A production build ready for deployment to AWS

5\. Brief documentation of any third-party libraries used and why

**7.2 What Is Out of Scope**

• The backend API - being built separately in FastAPI

• The database - PostgreSQL is already built and hosted on AWS

• The AI layer - Claude API integration is handled by the backend

• Apache Superset dashboards - deferred to a later phase

• User account creation and password management - handled by the database administrator

• Payment processing for the public subscription portal - a future phase

**7.3 Points of Contact**

All technical questions about the backend API, database schema, and AI layer should be directed to the database administrator - the database administrator - before starting work. Raise questions early. The API endpoints described in this document reflect the intended design. Confirm with the backend developer that all endpoints are live and tested before building any page that depends on them.

**END OF DOCUMENT**

_Excredite Consulting - Excredite Power Data Hub - Frontend Requirements - 2026_