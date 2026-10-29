# REMS — Result Evaluation and Management System

A full-stack web application for a university or college to manage course results end to end:
administrators set up the academic structure, lecturers enter coursework and examination marks for
the courses assigned to them, the system evaluates totals, grades and pass/fail automatically, and
students view and download only their own **published** results.

---

## Contents

1. [Features and roles](#features-and-roles)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Database schema](#database-schema)
5. [Installation](#installation)
6. [Environment variables](#environment-variables)
7. [Supabase project setup and migrations](#supabase-project-setup-and-migrations)
8. [Creating the first administrator](#creating-the-first-administrator)
9. [Running the app](#running-the-app)
10. [Testing](#testing)
11. [Production build and deployment](#production-build-and-deployment)
12. [Security considerations](#security-considerations)
13. [Assumptions](#assumptions)

---

## Features and roles

| Role | Can do |
|---|---|
| **Administrator** | Dashboard (students, lecturers, courses, published results, pass rate); create/edit/deactivate students and lecturers; manage departments, programmes, courses, academic periods; assign lecturers to courses; enroll students individually or by cohort; configure mark scheme, pass mark, workflow and grading scales; publish / return results; view system-wide results, reports, grade distributions; view and download any student's result statement (published results only); view audit logs; export result sheets. |
| **Lecturer** | Dashboard of assigned courses and progress; class lists; fast keyboard marks entry with live preview; save drafts; submit or publish (depending on configuration); correct published results with a reason (if permitted); view result history; search/filter results; export CSV/Excel; course performance. **Only for courses assigned to them.** |
| **Student** | Dashboard; own published results filtered by year/semester; performance summary (credit-weighted average, GPA/CGPA); printable statement and PDF download; profile. **Read-only, own published results only.** |

### Result workflow

```
draft ──submit──▶ submitted ──publish──▶ published ──correct (reason required)──▶ corrected
  ▲                   │
  └──return (admin)───┘
draft ──publish (admin, or lecturer if "Lecturers may publish" is on)──▶ published
```

* Default mark scheme (configurable): coursework /40 + exam /60 = total /100, pass mark 50
  (a course may override the pass mark).
* **Missing marks are never treated as zero.** A result missing either component is
  `incomplete`, has no grade, and cannot be submitted or published.
* Grades come from a configurable grading scale (default scale, optionally overridden per period).
* Students see `published` and `corrected` results only. Every correction is audited with its reason.
* Concurrent edits are detected with optimistic locking (`version`); the second writer gets HTTP 409.

**All roles** can reset a forgotten password by email (*Forgot password?* on the sign-in page) and
change their password on the profile page; changing it requires the current password.

## Technology stack

* **Client:** React 18, Vite 6, JavaScript, Tailwind CSS 4, React Router 6, Axios, Lucide React,
  jsPDF (statements), Vitest + Testing Library.
* **Server:** Node.js ≥ 20, Express 4 (ES modules), Zod, Helmet, CORS, express-rate-limit, ExcelJS,
  Vitest + Supertest.
* **Data:** Supabase PostgreSQL, Supabase Auth, Row Level Security, SQL migrations, pgTAP tests.
* **Package manager:** npm workspaces.

## Architecture

```
Browser (React SPA) ──── Supabase Auth (sign-in only, publishable key)
        │  Authorization: Bearer <access token>
        ▼
Express API  ── authenticate: verify token, load role/status from `profiles`
             ── requireRole → Zod validation → controller → service
             ── service: ownership/assignment checks + evaluation
        │  per-request Supabase client with the USER's JWT
        ▼
PostgreSQL  ── RLS policies (who can see/change which rows)
            ── results_before_write trigger (re-evaluates grade/status, enforces workflow)
            ── audit triggers (append-only audit_logs)
```

Key decisions:

* The browser never reads or writes data directly; all data goes through the API.
* The server uses the **user's** token for data access so RLS and audit triggers apply. The
  service-role key is used only to verify tokens, load profiles, and create, ban, or unban Auth users.
* Permissions are enforced three times: route role checks, service ownership checks, and database RLS
  plus triggers. Hiding a button in React is never the control.
* Evaluation logic lives in `server/src/utils/evaluation.js` (unit tested) and is mirrored by the
  database trigger, so even a direct Data API write cannot store an inconsistent grade.

```
result-management-system/
  client/            React app (src/components, layouts, pages, hooks, services, contexts, utils; tests/)
  server/            Express API (src/config, middleware, routes, controllers, services, validators, utils; tests/; scripts/)
  supabase/          migrations/, seed.sql, tests/ (pgTAP)
  CLAUDE.md          contributor/agent guide
```

## Database schema

| Table | Purpose / key constraints |
|---|---|
| `profiles` | 1:1 with `auth.users`; `full_name`, `email` (unique, lower-case), `role` (`admin`/`lecturer`/`student`, immutable), `account_status`. |
| `students` | `profile_id` (unique), `registration_number` (unique), `programme_id`, `year_of_study` 1–8. |
| `lecturers` | `profile_id` (unique), `staff_number` (unique), `department_id`. |
| `departments`, `programmes` | Codes unique and format-checked. |
| `courses` | `course_code` unique, `credit_units` 1–30, optional `pass_mark` override. |
| `academic_periods` | `academic_year` `YYYY/YYYY` (consecutive), `semester` 1–3, `end_date > start_date`, unique (year, semester). |
| `course_assignments` | lecturer ↔ course ↔ period, unique. |
| `enrollments` | student ↔ course ↔ period, unique; status `enrolled`/`withdrawn`/`completed`. |
| `results` | One per enrollment. `numeric(5,2)` marks; `total_mark` is a **generated column**; checks ensure incomplete ⇔ missing component ⇔ no grade, only complete results leave draft, `published_at` consistent; `version` for optimistic locking. |
| `grading_scales` | Bands per period (NULL = default). Exclusion constraint prevents overlapping bands. |
| `evaluation_settings` | Single row: coursework/exam maxima (must sum to 100), default pass mark, workflow switches. |
| `audit_logs` | Append-only; written by `SECURITY DEFINER` triggers with the acting user. |

Views (`security_invoker`, so the caller's RLS applies): `student_directory`, `lecturer_directory`,
`enrollment_details`, `result_details`, `assignment_details`, `course_result_summary`, `grade_counts`.

## Installation

Prerequisites: **Node.js 20+** (with npm on your `PATH`), a **Supabase** project (cloud or local),
and optionally the [Supabase CLI](https://supabase.com/docs/guides/cli). `supabase db push` needs only
the CLI; local development and the pgTAP tests (`supabase test db`) also need Docker Desktop.

Installing the Supabase CLI:

```powershell
# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
# or, per project, as a dev dependency (then prefix commands with npx):
npm install -D supabase
```

```bash
brew install supabase/tap/supabase   # macOS / Linux (Homebrew)
npm install -D supabase              # or per project; run as `npx supabase ...`
```

Windows PowerShell:

```powershell
git clone <your-repo-url> result-management-system
cd result-management-system
npm install
Copy-Item server\.env.example server\.env
Copy-Item client\.env.example client\.env
```

Linux / macOS:

```bash
git clone <your-repo-url> result-management-system
cd result-management-system
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
```

## Environment variables

`server/.env` (validated on startup; the server exits and lists any missing variable names):

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `PORT` | API port (default 4000) |
| `CLIENT_URL` | Allowed browser origin(s), comma-separated, for CORS |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** secret key. Never put it in the client. |

`client/.env`:

| Variable | Description |
|---|---|
| `VITE_API_URL` | API base. Dev: `/api` (Vite proxies to `http://localhost:4000`). Production: the public API URL, e.g. `https://api.example.edu/api` |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key only |

`.env` files are git-ignored. Find the values in Supabase Dashboard → Project Settings → API.

Optional, for the live database tests only (`npm run test:live -w server`). Put them in
`server/.env` or set them in the shell:

| Variable | Description |
|---|---|
| `LIVE_DEMO_PASSWORD` | The demo account password printed by `npm run seed:demo` |
| `LIVE_ADMIN_EMAIL`, `LIVE_ADMIN_PASSWORD` | An admin account; enables the admin checks (skipped if unset) |

## Supabase project setup and migrations

1. Create a project at <https://supabase.com> (or run `supabase start` locally).
2. **Authentication → Providers → Email:** keep email sign-in enabled and **disable "Allow new users
   to sign up"**. Accounts are created only by administrators. A self-registered user would have no
   profile and is refused by the API anyway.
3. **Authentication → URL Configuration** (needed for password-reset emails):
   * **Site URL:** the client origin, e.g. `http://localhost:5173` in development.
   * **Redirect URLs:** add `http://localhost:5173/reset-password` (and
     `https://<your-client-domain>/reset-password` in production). Supabase only sends users to
     allow-listed URLs, so without this entry the reset link will not open the reset page.
   * Supabase's built-in email sender is rate-limited and meant for testing. For production, set up
     custom SMTP under **Authentication → Emails → SMTP settings**.
4. Apply the migrations and reference data.

   Using the Supabase CLI (cloud project). The commands are the same in PowerShell and bash:

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   # Load reference data (departments, programmes, courses, periods, default grading scale):
   # paste supabase/seed.sql into the Dashboard SQL editor, or:
   psql "<your-database-connection-string>" -f supabase/seed.sql
   ```

   Local development (Docker; same commands in PowerShell and bash):

   ```bash
   supabase start          # prints local URL and keys for your .env files
   supabase db reset       # runs migrations + seed.sql
   ```

   Without the CLI, paste the files from `supabase/migrations/` **in filename order** into the
   Dashboard SQL editor, then run `supabase/seed.sql`.

## Creating the first administrator

From a trusted machine with `server/.env` configured. The script uses the service-role key, so
don't run it on a shared or untrusted machine:

```powershell
npm run create-admin -w server -- --email registrar@your-uni.edu --name "Ada Registrar"
# prompts for a password (min 12 chars); or set $env:ADMIN_PASSWORD first
```

```bash
ADMIN_PASSWORD='use-a-long-unique-password' npm run create-admin -w server -- --email registrar@your-uni.edu --name "Ada Registrar"
```

Sign in as that admin to create lecturers, students and further setup in the UI. Admin accounts can
only be created with this script, so privileged roles cannot be granted through the API.

**Optional demo data** (development only; fictional people; refuses to run with `NODE_ENV=production`).
It needs the reference data from `supabase/seed.sql`:

```powershell
npm run seed:demo -w server                                                     # prints a random shared password once
$env:DEMO_PASSWORD = 'Choose-A-Demo-Password-1'; npm run seed:demo -w server    # or choose one
```

```bash
npm run seed:demo -w server
DEMO_PASSWORD='Choose-A-Demo-Password-1' npm run seed:demo -w server
```

## Running the app

The same commands work in PowerShell and bash. In development the client calls `/api`, and Vite
proxies it to the API on port 4000.

```bash
npm run dev            # API on http://localhost:4000, client on http://localhost:5173
npm run dev -w server  # API only
npm run dev -w client  # client only
```

## Testing

The same commands work in PowerShell and bash:

```bash
npm test               # server (Vitest + Supertest) and client (Vitest + Testing Library)
npm test -w server
npm test -w client
npm run lint
supabase test db       # pgTAP RLS/trigger tests (needs the Supabase CLI, Docker and a local database)
```

**Live database tests.** These run against the real Supabase project in `server/.env`, so use a
**development project only**. They need the demo data (`npm run seed:demo -w server`). They change
evaluation settings and a few demo results, then restore them afterwards; the restores appear in
the audit log with no actor.

```powershell
$env:LIVE_DEMO_PASSWORD = '<demo password>'
$env:LIVE_ADMIN_EMAIL = 'registrar@your-uni.edu'; $env:LIVE_ADMIN_PASSWORD = '<admin password>'   # optional
npm run test:live -w server
```

```bash
export LIVE_DEMO_PASSWORD='<demo password>'
export LIVE_ADMIN_EMAIL='registrar@your-uni.edu' LIVE_ADMIN_PASSWORD='<admin password>'   # optional
npm run test:live -w server
```

Coverage:

* **Server unit tests:** total calculation, grade bands and boundaries, pass/fail including
  course overrides, invalid marks, incomplete results, grading-scale validation, GPA/average summary,
  and publication policy.
* **Server API tests:** these use a fake Supabase client. They cover missing, invalid or expired
  tokens, unprovisioned and inactive accounts, role checks on every sensitive route, students
  limited to their own published results, attempts to pass another student's id, students trying to
  edit marks, lecturers on unassigned courses (edit, list, export), server-computed evaluation,
  rejection of client-supplied totals, grades or authors (mass assignment), optimistic-lock
  conflicts, publication, submission, return and correction rules, admin safeguards, and errors that
  leak no internals.
* **Database tests (`supabase/tests/rls.test.sql`):** these run against real Postgres with separate
  admin, lecturer and student identities. They cover RLS visibility, write prevention, trigger
  re-grading, versioning, audit record creation, mark range enforcement, publication and correction
  rules, append-only audit logs and immutable roles.
* **Live database tests (`server/tests/live/`):** these call the Supabase Data API directly as
  anonymous, student, lecturer and admin users, bypassing Express the way an attacker with the public
  key could, and they also call the API in-process. They cover RLS visibility and write prevention,
  role elevation, audit-log tampering, and the publish and correct rules with the lecturer settings
  both off and on. They also cover submit locking, audit records with actor and before/after values,
  and two genuinely concurrent saves (one succeeds, one gets 409).
* **Client tests:** route guarding; login form validation and errors; confirm dialog; evaluation
  preview; grading-band validation; CSV escaping. Also the marks-entry workflow (live preview, max-mark
  validation, incomplete-not-zero, only marks sent to the API, 409 conflict reload, submit vs publish
  by setting), the admin student form (required fields, password rules, whitelisted payload,
  statement link), the admin dashboard, the staff result statement, and forgot / reset / change
  password.

## Production build and deployment

```powershell
npm run build                              # outputs client/dist
$env:NODE_ENV = 'production'; npm start    # runs the API
```

```bash
npm run build
NODE_ENV=production npm start
```

* **API:** deploy `server/` to any Node 20+ host (Render, Railway, Fly.io, Azure App Service, a VM).
  Set the env variables in the host's secret store, and set `CLIENT_URL` to the deployed client
  origin. Run it behind HTTPS (the app sets `trust proxy` for one proxy hop).
* **Client:** deploy `client/dist` to static hosting (Netlify, Vercel, Cloudflare Pages, S3+CDN).
  Set `VITE_API_URL` to the public API URL **at build time**, and configure SPA fallback to
  `index.html`.
* **Supabase:** run `supabase db push` against production, and set the Site URL and the
  `/reset-password` redirect URL in Auth settings (see setup step 3). Configure custom SMTP. Then
  create the first admin with the script.

## Security considerations

* **Authentication:** Supabase Auth tokens are verified server-side on every request. Role and
  status are read from `profiles`; client-supplied role or user ids are ignored or rejected.
* **Authorization:** role middleware, plus service-level course-assignment checks, plus RLS on every
  table, plus workflow triggers.
* **Least privilege:** data access uses the user's JWT. The service-role key is used only for token
  verification, profile lookup and Auth user management, and it lives only in `server/.env`.
* **No mass assignment:** strict Zod schemas reject unknown fields, and services whitelist columns.
  Totals, grades, statuses and authorship are always computed or set by the server and database.
* **Integrity:** CHECK constraints, a generated `total_mark`, an exclusion constraint on grade bands,
  transactional RPCs for multi-row changes, and optimistic locking.
* **Audit:** triggers record who changed what, with before and after values. Logs are append-only,
  even for admins.
* **Deactivation:** sets `account_status = inactive` *and* bans the Auth user, so existing sessions
  cannot refresh.
* **Passwords:** reset links go only to allow-listed redirect URLs, and the reset page accepts only a
  Supabase recovery session. The "forgot password" response is the same whether or not the account
  exists. Changing a password while signed in re-checks the current one.
* **Exports:** these respect the same permissions. CSV and Excel cells are protected against formula
  injection.
* **Hardening:** Helmet headers, a CORS allow-list, rate limiting, a 200 kB body limit,
  `Cache-Control: no-store`, and generic error messages (details are logged server-side only).
* Keep dependencies updated (`npm audit`), and rotate keys if one is ever exposed.

## Assumptions

* Marks have at most two decimals. Grade bands are contiguous in 0.01 steps.
* Changing the grading scale or mark scheme does not retro-grade stored results. Draft results are
  re-evaluated the next time they are saved; published results change only through audited
  corrections.
* A result belongs to exactly one enrollment (student × course × period). Withdrawn students cannot
  receive results, and students with submitted or published results cannot be withdrawn.
* GPA uses the grade points configured on the grading scale and is weighted by credit units.
* The PDF statement is labelled unofficial unless certified by the registry.
* Accounts are deactivated, not deleted. Audit logs are append-only, so deleting an Auth user who
  has acted would need to null `audit_logs.actor_id`, and the database refuses that.
