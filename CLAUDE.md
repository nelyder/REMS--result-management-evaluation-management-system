# CLAUDE.md — Result Evaluation and Management System (REMS)

Guidance for Claude Code (and humans) working in this repository. Read this before changing code.

## What this is

A full-stack web app for a university/college to manage course results end to end:
administrators set up the academic structure, lecturers enter marks for courses assigned to
them, the server evaluates totals/grades/pass-fail, and students view only their own
**published** results.

Three roles: `admin`, `lecturer`, `student`. Security is enforced on the **server and in
the database (RLS)** — hiding UI elements is never the security boundary.

## Stack

| Layer    | Tech |
|----------|------|
| Client   | React 18 + Vite, JavaScript, Tailwind CSS v4, React Router, Axios, Lucide React, jsPDF (statements), Vitest + Testing Library |
| Server   | Node.js (>=20) + Express, ES modules, Zod validation, helmet, cors, express-rate-limit, ExcelJS (exports), Vitest + Supertest |
| Data     | Supabase PostgreSQL, Supabase Auth, Row Level Security, SQL migrations in `supabase/migrations`, seed in `supabase/seed.sql`, pgTAP RLS tests in `supabase/tests` |
| Tooling  | npm (workspaces at repo root) |

## Repository layout

```
result-management-system/
  CLAUDE.md               # this file
  README.md               # setup, deployment, security docs
  package.json            # npm workspaces: client, server
  client/                 # React SPA
    src/
      components/         # reusable UI (ui/ primitives, DataTable, Modal, ConfirmDialog, ThemeToggle, AssignmentDialog...)
      layouts/            # AppLayout (sidebar + mobile nav), AuthLayout
      pages/              # public/, admin/, lecturer/, student/
      hooks/              # useApi, usePagination, useDebounce...
      services/           # api.js (axios instance), supabase.js (anon client, auth only), resource services
      contexts/           # AuthContext, ToastContext, ThemeContext
      utils/              # formatting, evaluation preview (display only), pdf, csv helpers
      App.jsx, main.jsx
    tests/
  server/
    src/
      config/             # env.js (Zod-validated env), supabase.js (client factories)
      middleware/         # authenticate, authorize, validate, errorHandler, rateLimit
      routes/             # one router per resource, mounted under /api
      controllers/        # thin HTTP handlers
      services/           # business logic + DB access
      validators/         # Zod schemas
      utils/              # evaluation.js (pure), HttpError, pagination, csv
      app.js              # express app (exported for tests)
      server.js           # listen()
    tests/
  supabase/
    migrations/           # ordered SQL: schema, functions/triggers, RLS policies
    seed.sql              # fictional reference data (no real personal information)
    tests/                # pgTAP RLS tests (`supabase test db`)
```

## Architecture decisions (keep these unless there is a strong reason)

1. **The browser only uses Supabase for authentication** (sign in / sign out / session refresh)
   with the publishable/anon key. All data reads and writes go through the Express API with
   `Authorization: Bearer <supabase access token>`.
2. **The server verifies every token** with `supabase.auth.getUser(token)`, then loads the
   caller's `profiles` row (role + account_status) from the database. Role/student id/lecturer
   id are **never** taken from the request body or headers. Inactive accounts get `403`.
3. **Two Supabase clients on the server:**
   - `userClient(token)` — anon key + the user's JWT, so **RLS applies** and DB triggers see
     `auth.uid()` (used for audit logging). This is the default for data access.
   - `adminClient` — service-role key, **server-only**, used solely where RLS cannot express
     the operation: creating/updating Auth users (`auth.admin.*`) and bootstrap. Each use is
     explicit and audit-logged with the verified actor id.
   The service-role key must never appear in `client/` or any `VITE_*` variable.
4. **Defense in depth:** Express middleware checks role, controllers/services check ownership
   and course assignment, and RLS policies enforce the same rules in Postgres.
5. **Result evaluation is computed server-side and enforced by the database.**
   `server/src/utils/evaluation.js` holds pure, unit-tested functions (validate marks, total,
   grade lookup, pass/fail). The `private.results_before_write` trigger applies the SAME rules
   (and the publication workflow), because the anon key is public and a user could otherwise
   write via the Data API directly. **If you change a rule, change both and their tests.**
   `total_mark` is a generated column. The client shows only a preview; client-supplied
   total/grade/status fields are rejected by the strict Zod schemas.
6. **Concurrency:** `results.version` integer for optimistic locking. `PATCH /api/results/:id`
   requires the `version` the client last saw; a mismatch returns `409 Conflict`. Writes that
   must be atomic (publish a course, correct a published result) are Postgres functions
   (`rpc`) running in one transaction.
7. **Audit logs are written by database triggers** (`SECURITY DEFINER`) on results, profiles,
   enrollments, course_assignments, courses and grading config. Ordinary users have no
   INSERT/UPDATE/DELETE on `audit_logs`; only admins can SELECT (lecturers see history for
   results of their assigned courses through a filtered endpoint).

## Domain rules

- Default mark scheme (configurable by admin in `evaluation_settings`):
  coursework max **40**, exam max **60**, total max **100**, pass mark **50**.
  Course-level `pass_mark` overrides the global default when set.
- Marks are `numeric(5,2)`, must be `>= 0` and `<= max`. Total = coursework + exam, `0..100`.
- **Missing marks are not zero.** A result with a missing component is `result_status =
  'incomplete'`, has no grade, and **cannot be published**.
- Grade comes from `grading_scales` (per academic period, falling back to the default scale
  where `academic_period_id IS NULL`). Bands must not overlap; lookup is
  `minimum_mark <= total <= maximum_mark`.
- `result_status`: `incomplete` | `pass` | `fail`.
- `publication_status`: `draft` → (`submitted`) → `published` → (`corrected`, still visible to
  students). `submitted` locks lecturer edits until an admin publishes or returns it to draft.
- Students see only rows with `publication_status IN ('published','corrected')` for their
  own enrollments.
- **Coursework assignments** (`assignments` + junction `assignment_students`, unique per pair)
  belong to a course offering (course + period, immutable). Admins and the lecturers assigned to
  that offering manage them; only students with a non-withdrawn enrollment on the offering can be
  assigned (trigger). Students see only assignments they are linked to (RLS). Removing a student
  deletes only the junction row. Not to be confused with `course_assignments` (lecturer ↔ course);
  in code the module is called *coursework* (`courseworkService`, `CourseworkPage`).
- Lecturers may create/edit **draft** results only for courses assigned to them in that
  academic period. Editing a published result ("correction") requires a `reason`, is
  allowed for the assigned lecturer only if `evaluation_settings.lecturer_can_correct` is
  true, otherwise admin only; it sets `publication_status = 'corrected'` and is audit-logged.
- Publishing: if `evaluation_settings.lecturer_can_publish` is true the assigned lecturer may
  publish; otherwise only admins. Only `complete` results (pass/fail) can be published.

## API contract (all under `/api`, JSON, auth required unless noted)

Responses: success `{ data, meta? }`; list `meta = { page, pageSize, total }`;
errors `{ error: { code, message, details? } }` with 400/401/403/404/409/422/500.
Pagination query: `page` (1-based), `pageSize` (max 100), `search`, `sort`, `order`.

| Method | Path | Roles |
|---|---|---|
| GET | `/health` (no auth) | — |
| GET | `/auth/me`, `/profile` | any |
| GET/POST | `/students`; GET/PATCH `/students/:id`; GET `/students/:id/statement` (published only) | admin |
| GET | `/students/me/results` (`?academicPeriodId`) | student |
| GET | `/students/me/summary` | student |
| GET/POST | `/lecturers`; PATCH `/lecturers/:id` | admin |
| GET/POST | `/departments`; PATCH/DELETE `/departments/:id` | admin (GET: any staff) |
| GET/POST | `/programmes`; PATCH/DELETE `/programmes/:id` | admin |
| GET/POST | `/courses`; PATCH `/courses/:id` | admin (GET: admin/lecturer) |
| GET/POST | `/academic-periods`; PATCH `/academic-periods/:id` | admin (GET: any) |
| GET/POST | `/course-assignments`; DELETE `/course-assignments/:id` | admin |
| GET/POST | `/assignments`; GET/PATCH/DELETE `/assignments/:id` (coursework) | admin, assigned lecturer |
| GET | `/assignments/eligible-students?courseId&academicPeriodId`, `/assignments/:id/eligible-students`, `/assignments/:id/students` | admin, assigned lecturer |
| POST/PUT | `/assignments/:id/students` (`{ studentIds }` add / replace); DELETE `/assignments/:id/students/:studentId` | admin, assigned lecturer |
| GET | `/students/me/assignments`, `/students/me/assignments/:id` | student (own only) |
| GET | `/lecturer/assignments` | lecturer (own) |
| GET | `/courses/:courseId/enrollments` (`?academicPeriodId`) | admin, assigned lecturer |
| POST | `/enrollments`, `/enrollments/bulk`; PATCH `/enrollments/:id` | admin |
| GET | `/results` (filters) ; GET `/results/:id` | admin, lecturer (assigned only) |
| POST | `/results` (upsert draft by enrollmentId) | admin, assigned lecturer |
| PATCH | `/results/:id` (requires `version`; `reason` if published) | admin, assigned lecturer |
| POST | `/results/:id/publish`; POST `/courses/:courseId/results/publish` | per publication setting |
| POST | `/courses/:courseId/results/submit` (lecturer/admin), `/courses/:courseId/results/return` (admin) | body `{ academicPeriodId }` |
| GET | `/results/:id/history` | admin, assigned lecturer |
| GET | `/courses/:courseId/results/export?format=csv\|xlsx&academicPeriodId=` | admin, assigned lecturer |
| GET/PUT | `/settings/evaluation`; GET/PUT `/grading-scales` | GET any staff, PUT admin |
| GET | `/reports/overview`, `/reports/course-performance`, `/reports/grade-distribution` | admin (lecturer: own courses) |
| GET | `/audit-logs` | admin |
| PATCH | `/users/:profileId/status` | admin |

## Commands

From the repo root (PowerShell or bash):

```
npm install                 # installs client + server workspaces
npm run dev                 # runs server (4000) and client (5173) together
npm run dev -w server       # API only
npm run dev -w client       # SPA only
npm test                    # all unit/integration tests (fakes; no database)
npm run test:live -w server # live RLS/workflow tests against the server/.env project (dev only; needs seed:demo)
npm run build               # production client build
npm run lint
```

Database (requires Supabase CLI + linked project or local Docker):

```
supabase db push            # apply migrations to linked project
supabase db reset           # local: re-run migrations + seed.sql
supabase test db            # pgTAP RLS tests
```

## Environment

- `server/.env` (see `server/.env.example`): `PORT`, `CLIENT_URL`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV`. Validated at startup by
  `server/src/config/env.js`; the server refuses to start if any are missing.
- `client/.env` (see `client/.env.example`): `VITE_API_URL`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`. **Never** put a service-role/secret key here.
- `.env` files are git-ignored. Do not commit real credentials. Do not fabricate them.

## Conventions

- ES modules everywhere (`"type": "module"`). `async/await`, no callbacks.
- Server: route → validate (Zod) → controller → service. Throw `HttpError`; never send raw
  Supabase/Postgres error messages to clients (log them server-side).
- Whitelist fields in services (no `...req.body` into inserts/updates) — prevents mass assignment.
- Client: pages compose components; data access only via `src/services/*`. Tailwind utility
  classes with the design tokens in `src/index.css` (Lavender brand + slate). Dark mode is a token
  swap under `.dark`: use `bg-surface` (not `bg-white`) for panels and `text-on-brand` (not
  `text-white`) on `bg-brand-*`, and let slate/status classes adapt; add `dark:` only when needed.
- Accessibility: every input has a label, tables have headers/captions, dialogs trap focus and
  close on Escape, visible focus rings, color is never the only status indicator.
- Tests: business rules and permissions must have tests. Use fictional data only
  (e.g. `REG/2024/0001`, "Amina Test").
- Do not claim tests pass or deployment works without running them.

## Status

All stages are implemented: frontend, backend, migrations/RLS/triggers, reports & exports,
tests and README. Migrations are applied to the dev project; server, client and live tests,
lint and the production build pass. `supabase/tests/*.test.sql` (pgTAP) have not been run: they
need the Supabase CLI + Docker.

Coursework assignments, the Lavender/dark theme and the review fixes are described in
`docs/development-plan.md`. Migrations `20260301000000_fix_withdrawn_counts.sql` and
`20260301000100_assignments.sql` are **not yet applied** to the dev project; until they are,
the assignment endpoints return errors and `tests/live/assignments.live.test.js` stops in its
first check.

- First admin: `npm run create-admin -w server -- --email ... --name "..."` (no API path can
  create admins). Demo data: `npm run seed:demo -w server` (dev only, fictional).
- API tests use `server/tests/helpers/fakeSupabase.js`; when adding a query, make sure the
  fake handlers in `api.test.js` still cover it.
- Live tests (`server/tests/live/`) use the demo data and must restore anything they change.
- Password reset/change uses Supabase Auth from the browser (auth only, like sign-in). The reset
  link needs `<client origin>/reset-password` in Supabase Auth → URL Configuration → Redirect URLs.

Keep the app runnable after each change.
