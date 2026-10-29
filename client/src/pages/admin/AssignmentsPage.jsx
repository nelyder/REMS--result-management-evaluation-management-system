import { Link } from 'react-router-dom';
import { ClipboardEdit } from 'lucide-react';
import { CrudPage } from '../../components/CrudPage.jsx';
import { assignmentsService } from '../../services/index.js';
import { useOptions } from '../../hooks/useOptions.js';
import { periodLabel } from '../../utils/format.js';

export default function AssignmentsPage() {
  const { lecturers, courses, periods } = useOptions(['lecturers', 'courses', 'periods']);
  return (
    <CrudPage
      title="Course assignments"
      description="Assign lecturers to courses for an academic period. Lecturers can only manage results for their assignments."
      entityName="assignment"
      service={assignmentsService}
      canEdit={false}
      canDelete
      searchPlaceholder="Search by course or lecturer…"
      filters={[
        { name: 'academicPeriodId', label: 'Periods', options: periods },
        { name: 'lecturerId', label: 'Lecturers', options: lecturers },
      ]}
      columns={[
        {
          key: 'course',
          header: 'Course',
          render: (r) => (
            <div>
              <p className="font-mono text-xs text-slate-500">{r.course?.code}</p>
              <p className="font-medium text-slate-900">{r.course?.name}</p>
            </div>
          ),
        },
        { key: 'lecturer', header: 'Lecturer', render: (r) => r.lecturer?.fullName || '—' },
        { key: 'academicPeriod', header: 'Period', render: (r) => periodLabel(r.academicPeriod) },
        { key: 'enrolledCount', header: 'Students', align: 'center', render: (r) => r.enrolledCount ?? 0 },
      ]}
      rowActions={(r) => (
        <Link
          to={`/admin/courses/${r.courseId}/periods/${r.academicPeriodId}/marks`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label={`Open results for ${r.course?.code}`}
          title="Open results"
        >
          <ClipboardEdit className="h-4 w-4" />
        </Link>
      )}
      fields={[
        { name: 'lecturerId', label: 'Lecturer', type: 'select', options: lecturers, required: true, full: true },
        { name: 'courseId', label: 'Course', type: 'select', options: courses, required: true, full: true },
        { name: 'academicPeriodId', label: 'Academic period', type: 'select', options: periods, required: true, full: true },
      ]}
      initialValues={{ lecturerId: '', courseId: '', academicPeriodId: '' }}
    />
  );
}
