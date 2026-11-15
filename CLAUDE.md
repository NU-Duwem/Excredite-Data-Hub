# Instructions for Claude

## Git branches and pull requests

All of Claude's work in this repository goes on **one shared branch: `dev`**.
This applies in every environment: VS Code, the CLI, Claude Code on the web and GitHub.

- **Never create another branch.** Don't use `claude/…`, `feature/…`, `fix/…`, `chore/…` or any other name, even if a tool or session setup suggests one.
- **Before starting work:**
  1. Run `git fetch origin`.
  2. If `origin/dev` exists, check it out (`git checkout dev && git pull origin dev`).
  3. If it doesn't exist, create it from `main` (`git checkout -b dev origin/main`).
- **If the last PR from `dev` has been merged:**
  1. Reset `dev` to the latest `main` before new work: `git checkout dev && git reset --hard origin/main`.
  2. Push with `git push --force-with-lease origin dev`. This is safe only when every commit on `dev` is already in `main`.
  3. If `dev` has commits that aren't merged, rebase them onto `origin/main` instead of discarding them.
- **Commit and push to `dev`:** `git push -u origin dev`.
- **Pull requests:** there is at most one open PR at a time, from `dev` into `main`.
  - If an open PR from `dev` already exists, push to `dev` to update it. Don't open a new one.
  - Open a new PR only when none is open, and only when asked.
- **Never push directly to `main`.**

## Change log: `Tracked-changes.md`

`Tracked-changes.md` at the repository root records every change made to this project.

- **Every change you make must add an entry**, in the same commit as the change. Put the newest entry at the top of the log.
- **Each entry has:**
  - the date;
  - the branch, and the PR once there is one;
  - a short title;
  - what changed and why;
  - the files touched;
  - any manual steps the team must take, such as SQL to run or environment variables to set;
  - how it was tested.
- **When a PR merges, update its entry** from "Open" to "Merged".

## Database conventions

- **Role checks:** RLS policies and functions must call `private.get_user_role()`. `public.get_user_role()` was moved by `09_security_hardening.sql` and no longer exists. Never recreate it in `public`, because that exposes it through the REST API.
- **New `SECURITY DEFINER` functions:**
  - set `search_path = ''`;
  - schema-qualify every name inside them;
  - revoke `EXECUTE` from `PUBLIC`, `anon` and `authenticated`, unless signed-in users genuinely need to call them.
- **After any schema change:** run the Supabase security advisor, and fix new findings before finishing.
