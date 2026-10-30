# Development plan — assignments, Lavender theme, bug fixes

Status: implemented; migrations awaiting application to the dev project (see section 4). Scope agreed with the product owner:

* a **new coursework-assignments module** (the existing "Course assignments" page, which
  links lecturers to courses, is unchanged);
* the whole app re-themed to **Lavender** with a **light / dark / system** toggle;
* a **full review** of the existing code with bugs fixed.

## 1. Findings from the code review

| # | Area | Problem | Fix |
|---|------|---------|-----|
| B1 | `client/src/utils/evaluation.js` | The marks preview rejects valid marks such as `1.1` or `0.29` ("at most 2 decimal places") because of floating-point error (`1.1 * 100 = 110.00000000000001`). | Compare with a tolerance, as the server does. |
| B2 | `MarksEntryPage` | Only the first 100 enrolled students are loaded; larger classes silently lose rows. | Load every page. |
| B3 | `MarksEntryPage` | Students whose enrollment is `completed` are hidden, so their results cannot be seen or corrected there (exports include them). | Show every non-withdrawn enrollment. |
| B4 | DB views `assignment_details`, `course_result_summary` | Results of **withdrawn** students are counted (a withdrawal is allowed while the result is a draft), so progress can exceed 100 % and "missing marks" can go negative; pass/fail counts and means include withdrawn students. | Count only non-withdrawn enrollments (new migration). |
| B5 | `useOptions` | Dropdowns load at most 100 items, so the 101st course / lecturer / programme / period never appears. | Load every page. |
| B6 | Reports "Export CSV" | Exports at most 100 rows, and a failure is an unhandled rejection with no message. | Load every page; show errors as toasts. |
| B7 | Students page, enroll-cohort dialog | Year of study offers 1–6, but the database allows 1–8; editing a year-7 student fails validation. | Offer 1–8. |
| B8 | `MarksEntryPage` | When creating a result conflicts (409), the toast says "latest values have been loaded" but nothing is loaded. | Accurate message. |
| B9 | Audit logs | Search says "actor or entity id" but only searches record ids. | Correct the placeholder. |
| B10 | Statement PDF | The cumulative summary can be drawn below the bottom margin. | Add a page when needed. |

Noted, not changed: a second correction made **directly through the Data API** can reuse the
previous correction reason (the API itself always requires a new one). Low risk; fixing it
would change correction semantics.

## 2. Lavender theme + dark mode

* Brand tokens in `client/src/index.css` move from blue to a lavender scale (WCAG AA for
  white text on `brand-700`).
* Dark mode is a **token swap**: under `.dark`, the slate scale, surface colour and status
  tints are redefined, so existing utility classes adapt without per-component `dark:` classes.
  Components use `bg-surface` instead of `bg-white` for panels.
* `ThemeContext` stores `light | dark | system` in `localStorage`; an inline script in
  `index.html` applies it before first paint (no flash). Toggle in the sidebar, mobile header
  and sign-in pages. Printing always uses the light palette.
* PDF statement and Excel export headers use the lavender brand colour.

## 3. Assignments module

### Data model (`supabase/migrations/20260301000000_assignments.sql`)

* `assignments`: `course_id`, `academic_period_id` (year + semester), `title`, `description`,
  `due_at`, `max_marks`, `created_by`, timestamps. Course and period cannot change after creation.
* `assignment_students` (junction): `id`, `assignment_id` → assignments (cascade),
  `student_id` → students (restrict), `assigned_at`, `assigned_by`, `assignment_status`
  (`assigned | submitted | graded`; only `assigned` is used until submissions exist),
  **unique (assignment_id, student_id)**.
* Trigger: a student can only be added if they have a non-withdrawn enrollment for the
  assignment's course and period.
* RLS: admins everything; lecturers only assignments of course offerings assigned to them;
  students only `SELECT` assignments they are linked to, and only their own junction rows.
* Atomic RPCs: `create_assignment(...)` (assignment + students in one transaction) and
  `set_assignment_students(...)` (replace the list).
* Audit triggers on both tables. Removing a student deletes only the junction row; accounts,
  enrollments, results and other records are untouched.

### API

| Method | Path | Roles |
|---|---|---|
| GET/POST | `/assignments` | admin, lecturer (assigned courses) |
| GET | `/assignments/eligible-students?courseId&academicPeriodId` | admin, assigned lecturer |
| GET/PATCH/DELETE | `/assignments/:id` | admin, assigned lecturer |
| GET | `/assignments/:id/students`, `/assignments/:id/eligible-students` | admin, assigned lecturer |
| POST/PUT | `/assignments/:id/students` (`{ studentIds }`, add / replace) | admin, assigned lecturer |
| DELETE | `/assignments/:id/students/:studentId` | admin, assigned lecturer |
| GET | `/students/me/assignments`, `/students/me/assignments/:id` | student (own only) |

### UI

* Lecturer **Assignments** page and admin **Coursework assignments** page: list with filters,
  Add / Manage / Delete.
* Add/Manage dialog: title, description, course, academic year, semester, due date, maximum
  marks, and an **Assigned students** section (search, select-all, checkboxes, selected count,
  selected list with remove buttons). In Manage mode, removing a saved student asks for
  confirmation and updates the list immediately.
* Student **Assignments** page and a dashboard card listing only their assigned assignments.

## 4. Testing

* Server unit/API tests (fake Supabase): validation, permissions (lecturer not assigned → 403,
  student → 403), duplicate prevention, add/remove, student visibility endpoints.
* Client tests: theme toggle, assignment dialog (search, select-all, count, remove + confirm).
* pgTAP RLS tests in `supabase/tests` for the new tables.
* Live tests (`server/tests/live/assignments.live.test.js`) against the dev project once the
  migration is applied: add, duplicate, remove, lecturer permissions, student visibility via
  the Data API directly. They clean up everything they create.
