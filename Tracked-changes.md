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

## 2026-11-18 · Team photos; "Sign in with email"; only listed staff can sign in
**Branch:** `dev` · **PR:** #7 · **Status:** Open

**What and why:** You sent the team photos, asked for the sign-in button to read "Sign in with email", and asked that only the five Microsoft 365 addresses you gave can get in, with no other email or kind of email.

**Changes:**
- **Team photos** (already live):
  - **Cropped and framed:**
    - Taiwo's and Eyo's were screenshots with a dark frame, so they were cropped inside the round photo;
    - Eyo is framed tighter on head and shoulders;
    - Osefan's wide shot is centred on her face;
    - Phillip's is a square crop.
  - **Saved** as 512×512 WebP in the private `avatars` bucket, and linked to each profile.
  - **How they were uploaded:** I don't hold the server's secret key, so I opened a one-off upload permission limited to exactly those four file paths, uploaded, and removed it straight away. Afterwards I confirmed that outsiders can neither upload nor download pictures.
  - **Duwem:** no photo was in the zip, so he shows initials until one is added.
- **Only listed staff** (`18_allowed_accounts.sql`, already applied):
  - **The list:** a new server-only `public.allowed_accounts` table holding the five addresses. It accepts only `@excredite.ng` addresses, and signed-in users and the public API can't read or change it.
  - **The rule:** the account trigger now also requires the address to be on the list. No other `@excredite.ng` address and no outside address can get an account by any route.
  - **Admin Panel:** **Add user** puts the address on the list first, and refuses anything that isn't `@excredite.ng`.
- **"Sign in with email":**
  - **On the button:** an envelope icon and the label "Sign in with email", with "Use your Excredite work email (@excredite.ng)" underneath. No Microsoft branding is shown.
  - **Behind it:** Excredite's Microsoft 365 sign-in, as before.
  - **When it's switched on** (`NEXT_PUBLIC_MICROSOFT_SIGN_IN=true`), the button is the only thing on the login page; the password form is hidden.
  - **Until then**, the password form stays so nobody is locked out.
- **Other changes:**
  - Error messages no longer mention Microsoft.
  - "Create account" is removed, and `/signup` redirects to the login page.
  - Profile & Settings shows the sign-in method as "Excredite work email".
- **Setup guide:** reworded throughout, with a new step to turn off password sign-in in Supabase once everyone has used the button. README updated.

**Files:**
- **Database:** `18_allowed_accounts.sql`.
- **Pages:** `frontend/app/login/page.tsx`, `frontend/app/signup/page.tsx`, `frontend/app/profile/page.tsx`.
- **Server:** `frontend/app/auth/callback/route.ts`, `frontend/app/api/admin/users/route.ts`.
- **Helpers and tests:** `frontend/utils/authRedirect.ts`, `frontend/utils/__tests__/authRedirect.test.ts`.
- **Docs:** `docs/technical/microsoft-365-sign-in.md`, `README.md`, `Tracked-changes.md`.

**Manual steps:**
1. The SQL and photos are already live.
2. Follow `docs/technical/microsoft-365-sign-in.md`, Parts 1 and 2. When everyone has signed in with the button, do step 6 there: turn off email-and-password sign-in.
3. Optional: add Duwem's photo in Profile & Settings.

**Testing:**
- **Unit tests:** 223 pass, 1 skipped. New tests cover the company-email check, and check that error messages don't mention Microsoft.
- **Code checks:** TypeScript is clean, with no new lint problems.
- **Build:** `next build --webpack` succeeds.
- **Pages:** `/signup` returns a redirect to `/login`. A screenshot of the login page confirmed the single "Sign in with email" button and the error panel.
- **Live database checks, rolled back afterwards:**
  - listed addresses work;
  - an unlisted `@excredite.ng` address and an outside address are refused;
  - the list rejects non-company addresses;
  - signed-in users can't read the list;
  - adding an address to the list lets that account be created.
- **Photos:** all four profiles point to files that exist. Anonymous download and upload are refused, and the temporary upload permission is gone.
- **Security advisor:** it noted that the new table had no access rule, so I added an explicit "no access through the API" rule. Only the existing leaked-password warning remains.

---

## 2026-11-18 · Profile pictures; Sign in with Microsoft; company accounts only; Phillip Ekpo
**Branch:** `dev` · **PR:** #7 · **Status:** Open

**What and why:** You asked for:
- Phillip's name and role to be corrected;
- profile pictures for every user, uploaded from the app;
- staff to sign in and verify through Excredite's Microsoft 365.

**Changes:**
- **Phillip Ekpo** (already applied to the live database):
  - name "Philip" → "Phillip" on his profile and sign-in account;
  - role "Application" → **System Admin**;
  - the stale role copy on his sign-in account was replaced by the server-controlled one.
- **Profile pictures** (`17_profile_pictures_and_company_accounts.sql`, already applied):
  - **Storage:** a new `user_profiles.avatar_path` column, which must point into the person's own folder, and a private `avatars` bucket (JPEG/PNG/WebP, at most 2 MB).
  - **Who can change pictures:** people can upload, replace or remove their own; admins can do this for anyone. All signed-in staff can see pictures.
  - **Work board:** `list_matter_people()` now returns each person's picture.
  - **In the app:**
    - an upload control in **Profile & Settings** and in the **Admin Panel** user details;
    - pictures in the sidebar, the Admin Panel user list, and work-board assignee chips and job leads;
    - initials when there's no picture.
  - **Upload handling:** pictures are cropped to a centred square and shrunk to 256×256 (WebP) in the browser before upload. The old file is deleted when a picture is replaced or removed.
  - **Admin uploads:** these go through a new `set-avatar` action on `/api/admin/users`. It checks that the file is in that user's folder and exists, and logs `ADMIN_SET_AVATAR`.
- **Company accounts only** (same SQL file): a trigger on `auth.users` refuses any account, new or a changed address, that isn't `@excredite.ng`.
- **Sign in with Microsoft:**
  - a **Sign in with Microsoft** button on the login page, shown only when `NEXT_PUBLIC_MICROSOFT_SIGN_IN=true`;
  - a new `/auth/callback` route that finishes the sign-in, refuses deactivated accounts, logs the sign-in and only redirects within the site;
  - plain-English errors on the login page, for example "Only @excredite.ng accounts…" or "Your account has not been set up in EPDH yet";
  - Profile & Settings now shows the real sign-in method;
  - the login placeholder now reads `you@excredite.ng`.
- **Setup guide:** `docs/technical/microsoft-365-sign-in.md`, step by step for the Microsoft 365 admin (Entra app registration) and an EPDH admin (Supabase settings). It also covers sending emails from `noreply@excredite.ng` through a sending service, with SPF, DKIM and DMARC.
- **README:** architecture, features, SQL order, environment variables, security, documents and structure.

**Files:**
- **Database:** `17_profile_pictures_and_company_accounts.sql`.
- **Pages:** `frontend/app/components/Avatar.tsx`, `frontend/app/components/AvatarEditor.tsx`, `frontend/app/components/Sidebar.tsx`, `frontend/app/profile/page.tsx`, `frontend/app/admin/page.tsx`, `frontend/app/matters/page.tsx`, `frontend/app/login/page.tsx`.
- **Server:** `frontend/app/auth/callback/route.ts`, `frontend/app/api/admin/users/route.ts`.
- **Helpers:** `frontend/utils/avatars.ts`, `frontend/utils/authRedirect.ts`, `frontend/utils/matterTasks.ts`.
- **Tests:** `frontend/utils/__tests__/avatars.test.ts`, `frontend/utils/__tests__/authRedirect.test.ts`.
- **Docs:** `docs/technical/microsoft-365-sign-in.md`, `README.md`, `Tracked-changes.md`.

**Manual steps:**
1. The SQL is already applied to the live database.
2. To turn on Microsoft sign-in, follow `docs/technical/microsoft-365-sign-in.md`:
   - **Part 1**, the Microsoft 365 admin: register the app with the `email` and `xms_edov` claims, and grant consent.
   - **Part 2**, an EPDH admin: turn on the Azure provider with the tenant URL; add the `/auth/callback` redirect URLs; turn off "Allow new users to sign up"; set `NEXT_PUBLIC_MICROSOFT_SIGN_IN=true`.
3. For company email sending, follow Part 3 of the same guide.

**Testing:**
- **Unit tests:** 222 pass, 1 skipped. The new tests cover initials, file checks, picture paths, cropping, redirect safety and error wording.
- **Code checks:** TypeScript is clean. ESLint shows no new problems; the remaining ones were already there.
- **Build:** `next build --webpack` succeeds.
- **Live database checks, as real users, rolled back afterwards:**
  - a Research Analyst can upload their own picture but not someone else's;
  - a profile can't point to another person's file;
  - people can't change their own role;
  - an admin can upload for anyone;
  - the work-board function returns pictures.
- **Company-accounts trigger:** same address allowed; another domain, a look-alike domain and an outside sign-up all refused.
- **Login page:** screenshot checked, with the Microsoft button, the divider and the error panel.
- **Security advisor:** no new findings. Only the existing leaked-password warning remains, which needs a paid plan.

---

## 2026-11-18 · Staff sign-in emails; shared admin account removed
**Branch:** `dev` · **PR:** #7 · **Status:** Open

**What and why:** You asked for every staff account to use its short company address, and for the shared admin account to be removed. Two accounts also still signed in with the misspelling "expo" left over from `04_name_fix.sql`.

**Changes (already applied to the live database):**

| Person | Old sign-in email | New |
|---|---|---|
| Duwem Nwapi | duwem.nwapi@excredite.ng | duwem@excredite.ng |
| Eyo Ekpo | eyo.expo@excredite.ng | eyo@excredite.ng |
| Philip Ekpo | philip.expo@excredite.ng | phillip@excredite.ng |
| Taiwo Odugbemi | taiwo.odugbemi@excredite.ng | taiwo@excredite.ng |
| Osefan Anegbe | osefan.anegbe@excredite.ng | osefan@excredite.ng |

- **For each person, updated:** the sign-in email, the email sign-in identity and the profile email. All three now match.
- **Kept:** passwords, roles and everything each person owns.
- **No emails sent:** addresses were changed directly and marked confirmed.
- **Removed:** `admin@excredite.ng`, with its profile, sessions and 23 activity-log entries. It owned no documents, alerts, jobs, tasks, settings or access grants.
- **Code:** no hard-coded staff emails in the code needed changing.

**Files:** `16_staff_emails.sql` (new: the record of the change, safe to re-run), `README.md` (SQL run order), `Tracked-changes.md`.

**Manual steps:** none for this database. Staff sign in with their new address and their existing password.

**Testing:** a query after the change confirmed that each user's sign-in, identity and profile emails match and the admin account is gone. The Supabase security advisor shows only the existing leaked-password warning, which needs a paid plan.

---

## 2026-11-18 · README rewritten to match the project
**Branch:** `dev` · **PR:** #7 · **Status:** Open

**What and why:** The README described features that don't exist (the Briefing Note Generator), left out most pages, numbered the setup steps out of order and showed the project structure as broken code fences. It now matches the app as it is.

**Changes to `README.md`:**
- **Intro and architecture:** an accurate description, plus an architecture table covering the AI providers, free local `gte-small` embeddings, hybrid search, text extraction, news and the edge functions.
- **Features:** every sidebar page (Overview, AI Query, Conversation History, Documents, News & Updates, Regulatory & Advisory Matters, Alerts, Admin Panel and Profile & Settings), plus the roles. The Briefing Note Generator was removed.
- **Setup:**
  - correctly numbered steps;
  - a full SQL run order from `schema.sql` through `15_…`, including `04`, `05` and `06`;
  - edge function deploy commands;
  - the SQL rules from `CLAUDE.md`.
- **Environment variables:** every variable the code reads, including the optional `ANTHROPIC_MODEL`, `GEMINI_MODEL`, `NEXT_PUBLIC_SITE_URL` and `EMBEDDINGS_CACHE_DIR`.
- **New sections:**
  - a scripts table;
  - bulk import with an options table;
  - News (RSS);
  - Tests;
  - Security & user accounts. These describe how admins add users and how to keep `/signup` closed.
- **Project structure:** an accurate tree in a properly fenced block.
- **Removed:** the misleading Windows `npm install --webpack` note.

**Files:** `README.md`, `Tracked-changes.md` (also marks PR #6 Merged).

**Manual steps:** none.

**Testing:** documentation only. Every page, route, script, environment variable, SQL file and test file named in the README was checked against the code.

---

## 2026-11-18 · Clear upload confirmation; project documents moved into `docs/`
**Branch:** `dev` · **PR:** #6 · **Status:** Merged

**What and why:**
1. **Upload confirmation.** After a successful upload the page used to show one small line of green text for 2 seconds, then cleared the form. That was easy to miss, and it said nothing about whether processing worked.
2. **Documents in one place.** You asked for all documents to sit in a single folder, grouped, with redundant files removed.

**Changes:**
- **Upload confirmation panel:** after an upload, a large panel replaces the form and stays until you move on.
  - **Title:** "Uploaded: now preparing it for the AI", then "Upload complete", or "Uploaded, but processing failed".
  - **The file:** document title, file name and size.
  - **Three live steps:** "File uploaded", "Reading the text" (with a spinner) and "Ready for AI search". These update on their own while the page refreshes pending documents every 4 seconds.
  - **On failure:** the reason, for example "Old Word format (.doc): open it in Word and save as .docx." A Re-process hint appears only when retrying could help.
  - **When complete:** any note, such as pages that need OCR.
  - **Buttons:** **Open document** (opens it in the library), **Upload another** and **Back to library**.
  - **Screen readers:** the panel announces its changes.
  - **Form label:** the "Document Title" label is now connected to its box.
- **Documents moved into `docs/`:**
  - **`docs/frontend/`:** Frontend Requirements (`.docx`), Frontend Improvement Log (`.docx`), `frontend improvement.md` and `conti.md` (moved from `frontend/`).
  - **`docs/technical/`:** Master Technical Documentation, Supabase + Vercel edition (`.docx`), and `build_log_session_1.md`.
- **Deleted as redundant** (you chose this; they can be recovered from git history):
  - the old pre-Supabase version of the master document: `before vercel.md` and `EPDH_Master_Technical_Documentation.backup_before_supabase_vercel.docx`;
  - `.md` files that were word-for-word copies of Word documents: `frontend.md` (Frontend Requirements) and `supabase-vercel.md` (Master Technical Documentation);
  - the unused Next.js starter `frontend/README.md`;
  - a Word lock file, `~$DH_Frontend_Improvement_Log.docx`.
- **`.gitignore`:** ignores Word and Excel lock files (`~$*`).
- **`README.md`:** new "Documentation" section describing `docs/`.
- **Not moved:** `README.md`, `CLAUDE.md` and `Tracked-changes.md` stay at the root, because GitHub and the tools look for them there.

**Files:**
- `frontend/app/documents/page.tsx`
- `docs/frontend/*` and `docs/technical/*` (moved)
- the deleted files above
- `.gitignore`
- `README.md`

**Manual steps:** none. On your computer, pulling `dev` moves the files; any copies you edited locally in the old places should be moved by hand.

**Tested:**
- **Under `next dev --webpack`, against a fake Supabase that stores files and records, in Chromium:**
  - **PDF upload:** the panel showed "now preparing" with the text step spinning, then switched to "Upload complete" with all three steps ticked and the blank-page note. **Open document** opened it in the library.
  - **Old `.doc` upload:** the panel showed "Uploaded, but processing failed" and the save-as-.docx reason.
  - **Upload another:** brought back an empty form.
- **Type check:** passes.
- **Lint:** the page's lint count is unchanged at 28, all in older code.
- **Tests:** 214 pass.
- **References:** nothing outside this change log refers to the moved or deleted files.

---

## 2026-11-17 · Fix "Can't resolve 'canvas'" when running the app with webpack
**Branch:** `dev` · **PR:** #5 · **Status:** Merged

**What and why:** After step 2, `npm run dev` showed a build error, "Module not found: Can't resolve 'canvas'", coming from `pdfjs-dist`. The dev script builds with webpack, which tries to bundle the PDF reader's optional `canvas` module. That module is only for drawing pages and isn't installed. My earlier test build used Next's default bundler, which doesn't hit this. `next.config.ts` now lists `pdfjs-dist`, `@huggingface/transformers` and `onnxruntime-node` in `serverExternalPackages`, so Node loads them at runtime instead of webpack bundling them. The embedding library also ships native binaries that shouldn't be bundled.

**Files:** `frontend/next.config.ts`

**Manual steps:** pull the latest `dev`, then restart `npm run dev`.

**Tested:**
- **Before the fix:** `next build --webpack` failed with the same error.
- **After the fix:** `next build --webpack` and `npm run build` both succeed.
- **Under `next dev --webpack` against a fake Supabase:** re-processing a three-page PDF read pages 1 and 3 with their page numbers, flagged blank page 2, embedded both chunks with `gte-small` (384 non-zero numbers each) and marked the document COMPLETE.
- **Remaining log warnings:** "Cannot polyfill DOMMatrix / Path2D" is harmless, since it only affects drawing pages as images.

---

## 2026-11-17 · Documents for the AI, step 2: bulk import tool and shared text extraction
**Branch:** `dev` · **PR:** #4 · **Status:** Merged

**What and why:** This is a command-line tool for loading the ~4 GB document collection. It runs on the computer that holds the files, starting with a few files, as you asked. Building it turned up a serious problem: **the PDF library (`pdf-parse`) can't read valid PDFs on this Node version** ("bad XRef entry" / "Invalid PDF structure"), so PDF processing in the app failed too. Both the app and the tool now use `pdfjs-dist`.

**Changes:**
- **`utils/extractText.ts` (new), shared by the app's processor and the import tool:**
  - **PDF:** read page by page with real page numbers, using `pdfjs-dist`. Pages with almost no text are reported as probably scanned.
  - **Word (`.docx`):** read in full.
  - **PowerPoint (`.pptx`):** read slide by slide, straight from the slide files, with real slide numbers.
  - **Excel and CSV:** read sheet by sheet.
  - **Text and Markdown:** read as plain text.
  - **Old `.doc`/`.ppt`:** reported with a "save as .docx/.pptx" message.
  - **Chunking:** chunks of about 1,200 characters that end at sentence boundaries.
- **App processor:**
  - uses the shared extractor;
  - records which pages had no text, in the notes and in `extracted_metadata`;
  - no longer turns a scanned PDF into a fake chunk holding only the title.
- **`frontend/scripts/import-documents.ts` (new), run with `npm run import-docs -- <folder>`:**
  - **`--dry-run`:** measures files, pages, scanned pages, chunks, and estimated database and storage space, without uploading anything.
  - **`--limit N`:** imports only the first N files, for a first small batch.
  - **Skips duplicates:** by content hash, including identical copies in different folders in the same run, so a stopped run can be restarted.
  - **Embeds before saving:** if embedding fails, nothing half-done is left in the database.
  - **Uploads the originals,** unless `--text-only` is given or the file is over 50 MB.
  - **Fills in each document:**
    - title from the file name, and document type guessed from the name (or set with `--type`);
    - classification from `--classification`, plus `--restricted`;
    - source path, format, blank pages and model;
    - each chunk keeps its page, slide or sheet.
  - **Report:** one line per file, a summary, and a JSON report.
- **`utils/importPlan.ts` (new):** the tool's command options, type guessing, safe storage paths and size estimates.
- **Dependencies:** `jszip` added; `tsx` and `pdf-lib` added for development and tests.

**Files:**
- `frontend/utils/extractText.ts` (new)
- `frontend/utils/importPlan.ts` (new)
- `frontend/scripts/import-documents.ts` (new)
- `frontend/utils/documentProcessor.ts`
- `frontend/package.json` and `frontend/package-lock.json`
- tests: `utils/__tests__/extractText.test.ts`, `utils/__tests__/importPlan.test.ts`
- `README.md` (new "Bulk document import" section)
- `Tracked-changes.md` (PR #3 marked Merged)

**Manual steps:**
- **On the computer with the documents:** pull this branch, run `npm install` in `frontend`, and make sure `.env.local` has the Supabase URL and service-role key.
- **Then:** do a dry run, then `--limit 5` (see the README).

**Tested:**
- **Tests:** 214 Vitest tests pass. They include extraction tests on real PDF, Word, PowerPoint and Excel files built in memory, covering blank-page detection, page and slide numbers, sheet names and old-format handling, and tests for every tool option.
- **Dry run on a sample folder:** a 3-page PDF with a blank page, a fully scanned PDF, a `.docx`, a `.pptx`, an `.xlsx`, an old `.doc` and a duplicate copy. Each file was classified correctly: 4 ready, 1 needs OCR, 1 unsupported, 1 duplicate.
- **Real import against a stateful fake Supabase:**
  - `--limit 3`, then a full run, then the same run again: the second run skipped the 2 files already imported, and the third imported nothing new.
  - The saved documents had the right titles, guessed types and classifications.
  - Every chunk had a real, non-zero 384-number embedding and the correct page, slide or sheet.
  - The originals were uploaded under `imports/<hash>/`.
- **Lint and type check:** both clean for the new code.

---

## 2026-11-17 · Documents for the AI, step 1: free embeddings, real search, open access with admin restrictions, locked-down routes
**Branch:** `dev` · **PR:** #3 · **Status:** Merged

**What and why:** This prepares the app for the bulk import of about 4 GB of documents. Checking the existing setup turned up these problems:
- **Search by meaning had never worked:** all 46 stored chunk embeddings were zeros, because the Gemini embedding calls failed and the code silently saved placeholders.
- **The AI ignored embeddings:** it found only chunks containing the question as an exact phrase.
- **Claude never searched documents:** it wasn't given the document-search tool, and its default model (`claude-3-5-sonnet-20241022`) is retired.
- **Access rules were bypassed:** the AI's document search ran with full server rights.
- **Routes without a sign-in check:** `/api/chat`, `/api/documents/[id]/download` and `/api/documents/process` worked without signing in, so anyone with a document's id could download it.
- **Any signed-in user could delete or overwrite any document.**
- **Wrong role check:** the Documents page read the role from `user_metadata`, which no longer holds roles, and showed made-up documents when the library was empty.
- **Document text went to Gemini:** the processor sent the first 4,000 characters of every document there for a summary. You asked for document text not to go to Gemini.

**Decisions (from you):**
- **Embeddings:** use whichever option is free. That's the open-source `gte-small` model, run locally: no cost, and no text leaves our systems to create embeddings.
- **Access:** every user can read Legal-Privileged documents, and admins keep control of permissions.

**Database (migration 15, already applied to the live database):**
- **Documents:**
  - every signed-in user can read every document, so classification is now a label only;
  - new `restricted` flag: a restricted document is visible only to admins, the app's service roles, and people listed in `document_user_access`;
  - admins can update documents.
- **Embeddings:**
  - 384 dimensions for `gte-small`, half the size of before, which helps on the Free plan;
  - the old all-zero vectors are cleared, though the chunk text stays and is still found by keyword search;
  - an HNSW index replaces the ivfflat index;
  - chunks are readable by whoever can read their document, and anonymous access is revoked.
- **New `match_document_chunks()`:** a meaning-plus-keyword search (reciprocal rank fusion) that runs with the caller's permissions, so it never returns restricted text to someone without access.

**App:**
- **`utils/embeddings.ts` (new):** local `gte-small` embeddings through `@huggingface/transformers`, shared by document processing and search. It throws on failure and never stores placeholders.
- **Document processing:**
  - uses the new embeddings, and marks a document FAILED with a reason instead of hiding errors;
  - saves the page and slide number with each chunk;
  - no longer sends text to Gemini, so summaries are off for now.
- **AI chat (`/api/chat`):**
  - requires sign-in;
  - searches documents as the signed-in user, with the new search;
  - Claude now has the document-search tool;
  - Claude's default model is `claude-opus-5-5`, with `temperature` removed (current models reject it) and `max_tokens` raised to 16,000;
  - server-side refusal fallbacks are on (`fallbacks: "default"`), refusals are handled, and all text blocks are joined into the answer.
- **Document routes:**
  - download, ask-about-a-document and copy only work on documents the user can see;
  - overwrite, delete, bulk delete (all or nothing) and re-process are limited to admins or the uploader;
  - re-processing now waits for the result (up to 300 s) instead of running in the background, where a hosting platform could stop it;
  - the storage bucket's "create if missing" fallbacks no longer create a **public** bucket.
- **Documents page:**
  - the role is read from `user_profiles`, and the made-up documents are gone;
  - **Access** (admins): choose "Everyone signed in" or "Restricted", and grant or remove access per person;
  - **Re-process** (admins and uploaders), with a result message;
  - a **Restricted** badge in the list and the workspace;
  - the delete button is hidden from people who can't delete.

**Files:**
- `15_document_access_and_search.sql` (new)
- `README.md`
- `frontend/package.json` and `frontend/package-lock.json` (`@huggingface/transformers`)
- `frontend/utils/embeddings.ts` (new)
- `frontend/utils/documentAccess.ts` (new)
- `frontend/utils/documentProcessor.ts`
- `frontend/app/api/chat/route.ts`
- `frontend/app/api/documents/{process,upload,edit,bulk-delete}/route.ts`
- `frontend/app/api/documents/[id]/{route,download/route,query/route}.ts`
- `frontend/app/documents/page.tsx`
- `frontend/app/documents/AccessDialog.tsx` (new)
- tests: `utils/__tests__/embeddings.test.ts`, `utils/__tests__/documentAccess.test.ts`

**Manual steps:**
- **Other databases:** run `15_document_access_and_search.sql`. The live project already has it.
- **Existing documents:** open each of the 4 and click **Re-process**, so they're embedded with the new model. Until then, keyword search still finds them.
- **First use:** the model (~34 MB) downloads from Hugging Face. On Vercel it's cached under `/tmp`. You can set `EMBEDDINGS_CACHE_DIR` to choose the folder.

**Not in this step:** bulk import, OCR for scanned pages, and storage sizing. Those are step 2: a dry-run report, then the import tool.

**Tested:**
- **Live database, in rolled-back transactions:**
  - an analyst can read a Legal-Privileged document, but can't see a restricted one or its text, including through search;
  - an analyst can't restrict documents; an admin can;
  - after a grant, the analyst sees the restricted document and its text;
  - anonymous visitors see nothing;
  - with real `gte-small` vectors, meaning search found the right passage for a question sharing no keywords with it, and hybrid search ranked the expected chunks.
- **Security advisor:** no new findings.
- **Tests:** 196 Vitest tests pass, including the new embedding and access tests. The real-model test passes with `RUN_MODEL_TESTS=1`.
- **Build and type check:** `next build` and `tsc` pass. The Documents page's lint count is unchanged at 28, all in older code.
- **API routes:** without a sign-in, `/api/chat`, download and process return 401.
- **End to end, against a local fake Supabase:** an admin's **Re-process** downloaded the file, extracted 3 chunks, embedded each with `gte-small` inside the Next.js server (384 non-zero numbers each), saved them and marked the document COMPLETE.
- **Chromium:**
  - an admin sees Access and Re-process, can restrict a document and grant access, and the exact database writes were checked;
  - an analyst who didn't upload the document sees neither button.

---

## 2026-11-17 · News feeds: power and energy sections instead of front pages
**Branch:** `dev` · **PR:** #2 · **Status:** Merged

**What and why:** Most Nigerian outlets had brought in no power stories at all: BusinessDay, Daily Trust, Premium Times and Vanguard none, and Nairametrics 2. A newspaper's main feed carries its latest stories on every topic, so the few power stories scroll out before they're pulled. I tested each outlet's electricity tag or energy section with the app's own parser and power-news filter, without saving anything, and switched to those feeds.

| Outlet | Main feed: power stories | New feed | New feed: power stories |
|---|---|---|---|
| Vanguard | 1 | electricity tag | 19 |
| Daily Trust | 0 | electricity tag | 14 |
| Premium Times | 0 | electricity tag | 8 (15 with the filter off) |
| Nairametrics | 0 | energy section | 9, all from the last 30 days |
| BusinessDay | 0 | energy section | 2 |
| Premium Times (NERC), new | – | NERC tag | 15 |

- **Keyword filter:**
  - **Off for tag feeds:** the outlet has already tagged the story as electricity or NERC news.
  - **On for energy sections:** they also cover oil and gas.
- **Existing stories** stay linked to their outlet.
- **Checked and left as they are:**
  - **Blocking automated requests:** Channels TV, The Guardian Nigeria, The Nation, ESI Africa and Energy Voice. Some of them returned 403 to the app's bot identity but not to a generic one; the app respects these blocks and doesn't pretend to be a browser.
  - **Punch:** no tag feed found.
  - **ThisDay:** its power tag has nothing newer than 2024.
  - **NERC's own website feed:** its newest item is from July 2025.
  - **Google News search feeds:** they refused requests from this shared server, and Google's terms restrict automated use.
- **Pulls still aren't running hourly:** the hourly job has no address to call until the app is deployed (`news_ingest_url` is empty). So the new feeds bring in stories only when someone clicks Refresh feeds in a running copy of the app.

**Files:**
- `14_news_sources_sections.sql` (new)
- `README.md`
- `Tracked-changes.md` (PR #1 marked Merged)

**Manual steps:**
- **Other databases:** run `14_news_sources_sections.sql`. The live project already has it.

**Tested:**
- **Before the change:** a dry run of the app's parser and power-news filter against every old and new feed. It fetched them through the same identity the app uses and saved nothing; the results are in the table above.
- **After applying it to the live database:** the local sources list shows the new addresses and filter settings.

---

## 2026-11-17 · "Anomaly Alerts" becomes "Alerts", rebuilt as a situation room
**Branch:** `dev` · **PR:** #1 · **Status:** Merged

**What and why:** The tab now covers everything the team must not miss, not only unusual power-plant output. That includes possible breaches of the law, urgent developments, contradictions between documents in the system, unusual grid data and problems with the system itself. The layout is design B, "Situation room", from the Anomaly Alerts canvas, and the tab is renamed **Alerts**.

**Database (migration 13, already applied to the live database):**
- **`anomaly_alerts` holds every kind of alert:**
  - new fields: category, severity (Critical, High, Medium, Low), title, evidence (a list of sources with quotes), what it affects, a suggested next step, a dismissal reason, who reported it, and resolved and updated times;
  - plant-only fields such as the output deviation are now optional, and the existing plant output alerts carry over unchanged.
- **Access:**
  - **Reporting:** anyone signed in can report an alert by hand, only as themselves, and it starts unassigned.
  - **Triage:** the legal team, analysts, the CEO, admins and the app can take, assign, resolve, dismiss and reopen alerts, and so can whoever an alert is assigned to. Before, only admins, the app and the assignee could change alerts, so nobody could take an unassigned one.
  - **Automatic alerts:** still written by admins, the app and the AI role.
  - **Reading:** unchanged; every signed-in user can see alerts.
- **Housekeeping:** a trigger keeps `updated_at`, `reviewed_at` and `resolved_at` up to date, and clears the dismissal reason when an alert is reopened.
- **New `sync_system_alerts()`,** callable only by the server:
  - after every news pull, it opens one alert per active feed whose last pull failed, never duplicates them, and resolves the alert once the feed works again or is switched off;
  - the news ingestion route now calls it.
- **Safety limits:** the database caps text lengths and the evidence size, and accepts only valid categories and severities.

**Page (`/alerts`):**
- **Critical banner:** open critical alerts as large cards, with **Take it** and **See evidence**. When there are none, it says "No critical alerts right now".
- **Kind tiles:** one per kind of alert, with its open count and worst severity. Click one to filter the feed.
- **Feed:** tabs for Open, Investigating, Resolved and Dismissed.
- **Most alerts in the last 30 days:** the companies, plants and documents that keep coming up.
- **Alert details:**
  - evidence quotes with their sources; only http(s) links are ever shown, so a `javascript:` link in reported evidence is dropped;
  - what it affects, the plant, document, linked job and news story;
  - a suggested next step;
  - actions: take it, assign, mark resolved, dismiss (a reason is required), reopen, **Add as task on job** (adds a task on the Regulatory & Advisory board), and **Ask AI**.
- **Report an alert:** headline, kind, urgency, what it affects, an optional linked job, details, and an evidence link and quote.
- **Who sees what:** general staff can report alerts and read them, but not act on them.
- **Live updates:** the page refreshes when alerts change.
- **Rename:** the sidebar, the Overview tile ("Alerts", now showing alert titles), the Admin module name and the README all say "Alerts".

**Also fixed:** dialogs on Alerts and Regulatory & Advisory now close with Escape even after the button you clicked disappears, for example after Reopen or "Delete for good". Before, keyboard focus fell back to the page and Escape did nothing.

**Not yet automatic:** spotting legal breaches and urgent developments in the news, and contradictions between documents, needs the AI layer. The categories, fields and access for that are ready, but for now these alerts come from people reporting them.

**Files:**
- `13_alerts.sql` (new)
- `README.md`
- `frontend/app/alerts/page.tsx`
- `frontend/utils/alerts.ts` (new)
- `frontend/utils/__tests__/alerts.test.ts` (new)
- `frontend/app/components/Sidebar.tsx`
- `frontend/app/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/api/news/ingest/route.ts`
- `frontend/app/matters/page.tsx` (the Escape fix)

**Manual steps:**
- **Other databases:** run `13_alerts.sql`. The live project already has it.

**Tested:**
- **Live database, in rolled-back transactions:**
  - an analyst's report is saved;
  - a user without a triage role can read alerts but not change them;
  - an analyst can take, dismiss (with a reason), reopen (the reason is cleared) and resolve, and the timestamps are set;
  - reporting as someone else, faking a system alert and an invalid severity are all refused;
  - signed-in users can't run the feed check, and anonymous visitors see nothing;
  - a failing feed opens one alert, a second run adds none, and the alert resolves when the feed recovers.
- **Security advisor:** no new findings.
- **Tests:** 189 Vitest tests pass, including 12 new ones for alerts: link safety, evidence, titles, sorting, tiles, the "most alerts" list, times and reports.
- **Build and lint:** `next build` passes. Lint is clean except one error in `Sidebar.tsx` (setting state inside an effect) that was already there.
- **Chromium, with a fake Supabase:**
  - the banner, tiles, feed, status tabs and "most alerts" list;
  - tile filtering, and the reasons on dismissed alerts;
  - evidence, with the unsafe link not shown;
  - take it, the dismiss-reason requirement, reopen, assign, adding a task to the job, the Ask AI link and resolve;
  - reporting, with its error messages and the row it saves;
  - general staff can only read and report;
  - the empty state, and no sideways page scroll at 390px;
  - the Regulatory & Advisory board test still passes, including Escape.

---

## 2026-11-16 · Project moved to its own repository
**Branch:** `dev` · **PR:** #1 · **Status:** Merged

**What and why:** The project now lives on its own in **NU-Duwem/Excredite-Data-Hub**. Before, it was **NU-Duwem/EPDH-UPDATED**, a fork of another repository; the move makes it standalone.

**Changes:**
- **Git history moved in full:**
  - all 42 commits, from "first commit" on 11 May 2026 to the merge of PR #10;
  - both branches, `main` and `dev`, pointing to the same commits as in the old repository;
  - the old repository had no tags.
- **README replaced:** the new repository's automatic "Initial commit" held only a README with the title `# Excredite-Data-Hub`. It was replaced by the project's `main`.
- **PR numbers:** pull requests #1–#10 in the entries below belong to the old repository, at `https://github.com/NU-Duwem/EPDH-UPDATED/pull/<number>`. Pull requests in this repository start again from #1.
- **No file changes needed:** nothing in the project referred to the old repository's name.
- **Also in this commit:** the PR #10 entry is marked Merged.

**Files:** `Tracked-changes.md`

**Manual steps:**
- **Repository settings,** which don't move with git: Actions secrets and variables, branch protection, webhooks and collaborators.
- **Connected services:**
  - point the Vercel project, and any Supabase GitHub integration, at this repository;
  - install the Claude GitHub App on it.
- **Local clones:** update each developer's remote:
  `git remote set-url origin https://github.com/NU-Duwem/Excredite-Data-Hub.git`
- **Old repository:** archive or delete it once you're happy with the move. Its pull requests stay readable only while it exists.

**Tested:**
- **Branch heads:** `git ls-remote` shows identical `main` (`e2c42fd`) and `dev` (`d52315c`) in both repositories.
- **History:** a fresh bare clone of the new repository has all 42 commits.
- **Integrity:** `git fsck` reports no errors.

---

## 2026-11-16 · Regulatory & Advisory rebuilt as a work board with tasks
**Branch:** `dev` · **PR:** #10 · **Status:** Merged

**What and why:** The section now holds the firm's jobs (current and closed), the tasks on each job with their dates, and who each task is assigned to: one person, or the whole team. This is design C, "Work board", from the Regulatory & Advisory canvas. Before, a job had only a free-text lead and a single deadline, and there were no tasks at all.

**Database (migration 12, already applied to the live database):**
- **New `matter_tasks` table:**
  - holds title, notes, status (To do, In progress, In review, Done), start and due dates, and a sort position;
  - the assignee is either a person or the whole team, never both, and the database enforces this;
  - `completed_at` and `updated_at` are kept up to date automatically;
  - the database rejects a due date before the start date.
- **`matters.lead_user_id`:** the lead is now a real user. The old `lead_counsel` text is kept, so existing jobs still show their lead.
- **Access:**
  - The legal team, admins and the app can create and edit jobs and tasks. The legal team can now edit jobs; before, only admins and the app could.
  - The CEO can view jobs and tasks but not change them.
  - Other roles can't see them.
- **New `list_matter_people()`:**
  - returns only the names and roles of active admins, the CEO and the legal team, never emails, so the board can show who a task is assigned to;
  - the lookup that needs elevated rights lives in the private schema (`private.matter_people()`), and the public function is a thin wrapper that runs with the caller's own rights;
  - before this, non-admins couldn't read other people's profiles at all.

**Page (`/matters`):**
- **Job cards along the top**, starting with "All jobs". Each shows the reference, client, deadline, tasks done out of total, a progress bar and an overdue flag. Click one to show only its tasks.
- **Selected job's details:** status, lead, opened date, deadline and notes, the documents linked to it, plus Edit job and Add task.
- **Four columns:** To do, In progress, In review and Done.
  - Each card shows its job, who it's assigned to (a person, "(you)", or a dark **Whole team** chip) and its dates. Overdue dates show in red as "was …".
  - Drag a card to another column to change its status. On a phone, open the card and change the status there instead.
- **Filters:** Everyone, My tasks (your tasks plus whole-team tasks), Whole team, Due this week, Overdue, and Show closed jobs.
- **Task dialog:** add, edit or delete a task (deleting asks for confirmation), with clear messages when something is missing or the dates are wrong.
- **Job dialog:**
  - create or edit a job, choosing the client from the organisations list, the type, status, lead, opened date, deadline and notes;
  - closing a job records the date it closed.
- **Who sees what:** the CEO sees the board read-only, and other roles see a short "ask an admin for access" message.

**Bugs fixed from the old page:**
- **Role check:** it read the role from `user_metadata`, which is no longer used for roles since migration 11.
- **Fake data:** it showed made-up matters whenever the database returned none.
- **Deadline:** it showed a fixed date of 15 Aug 2026 instead of each job's real deadline.
- **Creating a matter always failed:** it sent types like "Tariff Dispute", which the database rejects.

**Files:**
- `12_matter_tasks.sql` (new)
- `README.md`
- `frontend/app/matters/page.tsx`
- `frontend/utils/matterTasks.ts` (new)
- `frontend/utils/__tests__/matterTasks.test.ts` (new)
- `Tracked-changes.md` (PR #9 marked Merged)

**Manual steps:**
- **Other databases:** run `12_matter_tasks.sql`. The live project already has it.
- **Existing leads:** the three existing jobs have no `lead_user_id` yet, so they show their old typed lead name. Choose a real lead with Edit job when convenient.

**Tested:**
- **Access, checked live in rolled-back transactions:**
  - the legal team can add, finish and reopen a task, and `completed_at` is set and cleared;
  - the legal team can edit jobs;
  - the CEO can read but not insert or update;
  - an analyst sees no tasks and no people;
  - anonymous visitors are blocked;
  - "whole team plus a person" and a due date before the start date are both rejected.
- **People lookup:** returns names without emails.
- **Security advisor:** no new findings. Only the existing leaked-password setting remains.
- **Tests and build:** 177 Vitest tests pass, including 16 new ones for the board's filters, sorting, progress, dates and form checks, and `next build` passes.
- **Chromium, with an in-memory fake Supabase:**
  - the job cards, columns, overdue display and assignee chips;
  - every filter, and the show-closed toggle;
  - job details and linked documents;
  - adding a task from a column (job and status pre-filled), the title and date error messages, and editing to reassign and mark done;
  - drag and drop, which sends a status-only update;
  - delete with confirmation;
  - creating a job, which then opens it, and closing a job, which sets the closed date;
  - CEO read-only, with no edit buttons, no dragging, disabled fields and Escape to close;
  - the analyst's no-access message;
  - no sideways scrolling of the page at 390px.

---

## 2026-11-16 · AI Query redesigned as a "report thread"
**Branch:** `dev` · **PR:** #9 · **Status:** Merged

**What and why:** This is design B, "Report thread", from the AI Query canvas. The page was a plain chat; now each question and its answer form a numbered card (Q1, Q2…), which reads like a briefing and is easier to share.

**Changes:**
- **Layout:**
  - One centred column with a header showing the conversation's first question and how many questions it has, plus **History** and **New conversation**.
  - The question box sits at the bottom, with shortcuts to Upload, Library, Document Generator, Legal Matters and News. These replace the old Documents dropdown and link chips.
  - The latest card has an amber outline.
- **Starting screen:** "What do you need to know?" with four starter questions (Generation, News, Legal, Documents). Clicking one asks it straight away.
- **Answer actions that now work.** Before, these buttons did nothing:
  - **Copy** copies the question and answer, then shows "Copied".
  - **Download PDF** opens the browser's print dialog for a clean, branded page holding just that answer. Choose "Save as PDF" there.
  - **Turn into document** opens the Document Generator with the question already filled in as the title (new `?title=` parameter).
- **Document notice:**
  - It now appears inside the card of the question that asked for a document.
  - It's worded honestly: "Make this a document" opens the Generator. The old "Output ready" claim was wrong, because the chat doesn't create files.
- **Unchanged behaviour:**
  - questions handed over from Overview (`?q=`);
  - reopening conversations from History (`?session=`);
  - saving to this browser;
  - the `/api/chat` call;
  - Enter to send, Shift+Enter for a new line.
- **Answer safety:** text in answers is escaped, so they can't inject HTML, including in the printed PDF.

**Files:**
- `frontend/app/query/page.tsx`
- `frontend/app/documents/page.tsx` (fills in the Generator title from `?title=`)
- `frontend/utils/queryTurns.ts` (new)
- `frontend/utils/__tests__/queryTurns.test.ts` (new)

**Manual steps:** none.

**Tested:**
- **Tests:** 161 Vitest tests pass, including 10 new `queryTurns` tests: question/answer pairing, escaping, Markdown to HTML, and the printable page.
- **Build and lint:** `next build` passes, the query page lints clean, and the Documents page's lint count is unchanged (28 findings that were already there).
- **Chromium, with a mocked Supabase and chat API:**
  - the starting screen and its four starters;
  - the loading state;
  - Q1 and Q2 cards with the outline on the latest;
  - the follow-up sends the full history;
  - the document notice appears only on the card that asked;
  - Copy fills the clipboard and shows "Copied";
  - the print page has the escaped answer;
  - the conversation is saved for History;
  - "Turn into document" fills in the Generator title;
  - reopening from History, New conversation, and the `?q=` handover (asked exactly once);
  - no sideways scrolling at 390px.

---

## 2026-11-16 · Redesigned Profile, History, Admin Panel and Documents; role lockdown
**Branch:** `dev` · **PR:** #8 · **Status:** Merged

**What and why:** These are the designs picked from the alternatives canvas. Profile & Settings uses the "Analyst table" design (C). Conversation History, Documents and Admin Panel use "Split view" (A). Anomaly Alerts and Regulatory & Advisory are unchanged. While wiring the pages to real data, several bugs and a serious security hole turned up, and they are fixed here too.

**Security (migration 11, already applied to the live database):**
- **Privilege escalation:** any signed-in user could make themselves `power_admin`, or reactivate their own account. The RLS policy "Users can update own profile (not role)" only checked that the row was theirs. Signed-in users can now update only `full_name` and `updated_at`.
- **Signup trigger:** `handle_new_user()` trusted `raw_user_meta_data->>'role'`, which the person signing up controls. It now reads `raw_app_meta_data` (server-set only), and defaults to `power_team`.
- **New `public.force_logout_user(uuid)`:** `SECURITY DEFINER`, `search_path = ''`, executable by `service_role` only. It deletes a user's sessions and refresh tokens.

**Admin API (`/api/admin/users`):**
- **New actions:**
  - `create-user`: sets a confirmed email, the role in `app_metadata`, and a password of at least 6 characters.
  - `set-role`: won't demote the last active admin.
- **`force-logout`:** really signs the user out now. Before, it was a no-op that reported success.
- **Deactivating** a user also signs them out. You can't deactivate yourself.
- **Every action** is logged to the activity log.

**Pages:**
- **Profile & Settings:**
  - Account, Password, Notifications and My activity, each with an "On this page" index.
  - Your name is editable and saved.
  - A password change checks your current password first.
  - `?force_reset=true` shows a banner and jumps to Password.
  - My activity shows your real last 20 activity-log entries. The mock rows are removed.
- **Conversation History:**
  - A list grouped by day sits next to the transcript, with search.
  - The time-range filter now works.
  - You can delete a conversation, with a confirm step.
  - "Continue conversation" reopens the chat in AI Query (`/query?session=…`).
  - The fake sample conversations are removed.
- **Admin Panel:**
  - Sections: Users, Roles & permissions, Anomaly engine, Audit log.
  - Users is a list beside a detail panel, with role and status, what the role can open, and reset, sign-out and deactivate actions.
  - "Invite user" now works.
  - The roles matrix is marked preview only.
  - Engine settings save through the API.
  - The audit log reads the real activity log. Before, it read a table that doesn't exist and fell back to mock data.
- **Documents:**
  - The library opens by default, as a list beside the document workspace.
  - Rows show file-type badges and status chips.
  - "Generate document" and "Upload" move to the header.
  - Upload and generation logic are unchanged.

**Files:**
- `11_user_roles_lockdown.sql` (new)
- `README.md`
- `frontend/app/api/admin/users/route.ts`
- `frontend/app/{profile,history,admin,documents,query}/page.tsx`
- `frontend/utils/chatSessions.ts` (new)
- `frontend/utils/__tests__/chatSessions.test.ts` (new)
- `supabase/functions/admin-invite-user/index.ts`

**Manual steps:**
- **Other databases:** run `11_user_roles_lockdown.sql` (the live project already has it).
- **Redeploy the edge function:** `supabase functions deploy admin-invite-user`, so invited users get their role from `app_metadata`.
- **Still pending:** the dashboard toggle "Prevent use of leaked passwords". It is the only security-advisor finding left.

**Tested:**
- **Migration 11, in rolled-back transactions on the live database:**
  - A non-admin changing their role is refused.
  - A name change works.
  - Only `service_role` can call `force_logout_user`.
  - Signup takes the role from `app_metadata`.
- **Security advisor:** no new findings.
- **Tests and build:** 151 Vitest tests pass, including 7 new `chatSessions` tests, and `next build` passes.
- **Chromium, with a mocked Supabase:**
  - Profile: the sections and the force-reset banner.
  - History: day groups, the 7-day filter, delete, and continuing in AI Query.
  - Admin: each action sends exactly the expected API calls.
  - Documents: the library, the workspace and the upload view.

---

## 2026-11-16 · Scrollable filter panel on News & Updates
**Branch:** `dev` · **PR:** #7 · **Status:** Merged

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
