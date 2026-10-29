// Publication workflow rules (mirrored by the results_before_write trigger).
//
//   draft ──submit──▶ submitted ──publish──▶ published ──correct──▶ corrected
//     ▲                   │                      (visible to students)
//     └──────return───────┘ (admin)
//   draft ──publish (admin, or lecturer if lecturerCanPublish)──▶ published

export const VISIBLE_TO_STUDENTS = Object.freeze(['published', 'corrected']);

/** How a staff member may change a result's marks: 'edit' | 'correct' | 'locked'. */
export function editMode({ publicationStatus, role, settings }) {
  if (role !== 'admin' && role !== 'lecturer') return 'locked';
  if (!publicationStatus || publicationStatus === 'draft') return 'edit';
  if (publicationStatus === 'submitted') return role === 'admin' ? 'edit' : 'locked';
  return role === 'admin' || settings.lecturerCanCorrect ? 'correct' : 'locked';
}

export function canPublish({ role, settings }) {
  return role === 'admin' || (role === 'lecturer' && !!settings.lecturerCanPublish);
}

export function canSubmit({ role }) {
  return role === 'lecturer' || role === 'admin';
}

export function canReturn({ role }) {
  return role === 'admin';
}

/** Statuses a course-level transition moves from, keyed by target. */
export const TRANSITION_SOURCES = Object.freeze({
  submitted: ['draft'],
  published: ['draft', 'submitted'],
  draft: ['submitted'],
});

/** Validates publishing a single result. Returns an error message or null. */
export function publishError({ result, role, settings }) {
  if (!canPublish({ role, settings })) return 'You are not authorised to publish results.';
  if (result.resultStatus === 'incomplete') return 'Incomplete results cannot be published.';
  if (VISIBLE_TO_STUDENTS.includes(result.publicationStatus)) return 'This result is already published.';
  return null;
}
