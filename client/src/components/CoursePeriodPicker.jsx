import { Select } from './ui/index.js';

/** Course + academic period selectors used by enrollment and result screens. */
export function CoursePeriodPicker({ courses, periods, courseId, periodId, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label="Course"
        value={courseId}
        onChange={(e) => onChange({ courseId: e.target.value, periodId })}
        options={courses}
        placeholder="Select a course"
      />
      <Select
        label="Academic period"
        value={periodId}
        onChange={(e) => onChange({ courseId, periodId: e.target.value })}
        options={periods}
        placeholder="Select a period"
      />
    </div>
  );
}
