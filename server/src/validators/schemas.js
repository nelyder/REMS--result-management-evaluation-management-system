import { z } from 'zod';

// ---------- primitives ----------
export const uuid = z.string().uuid('Must be a valid id.');
const text = (min, max) => z.string().trim().min(min).max(max);
const mark = z
  .number({ invalid_type_error: 'Mark must be a number.' })
  .finite()
  .min(0, 'Mark cannot be negative.')
  .max(100, 'Mark cannot exceed 100.')
  .nullable();
const optionalUuid = uuid.optional().or(z.literal('').transform(() => undefined));

export const idParams = z.object({ id: uuid }).strict();
export const courseParams = z.object({ courseId: uuid }).strict();
export const profileParams = z.object({ profileId: uuid }).strict();

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ---------- people ----------
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, 'Password must be at least 10 characters.').max(72);
const fullName = text(2, 120);
const registrationNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/-]{4,30}$/, 'Use letters, digits, "/" or "-" (4–30 characters).');
const staffNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/-]{3,30}$/, 'Use letters, digits, "/" or "-" (3–30 characters).');
const yearOfStudy = z.coerce.number().int().min(1).max(8);

export const studentCreate = z
  .object({ fullName, email, password, registrationNumber, programmeId: uuid, yearOfStudy })
  .strict();
export const studentUpdate = z.object({ fullName, registrationNumber, programmeId: uuid, yearOfStudy }).strict();
export const studentListQuery = listQuery.extend({
  programmeId: optionalUuid,
  yearOfStudy: z.coerce.number().int().min(1).max(8).optional(),
  accountStatus: z.enum(['active', 'inactive']).optional(),
});

export const lecturerCreate = z.object({ fullName, email, password, staffNumber, departmentId: uuid }).strict();
export const lecturerUpdate = z.object({ fullName, staffNumber, departmentId: uuid }).strict();
export const lecturerListQuery = listQuery.extend({ departmentId: optionalUuid });

export const statusUpdate = z.object({ accountStatus: z.enum(['active', 'inactive']) }).strict();

// ---------- academic structure ----------
export const departmentBody = z
  .object({ name: text(2, 120), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/, 'Use 2–12 letters/digits.') })
  .strict();

export const programmeBody = z
  .object({
    name: text(2, 150),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,16}$/, 'Use 2–16 letters/digits/hyphens.'),
    departmentId: uuid,
  })
  .strict();
export const programmeListQuery = listQuery.extend({ departmentId: optionalUuid });

export const courseBody = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,6} ?[0-9]{3,4}[A-Z]?$/, 'Use a code like "CSC 201".'),
    name: text(2, 150),
    creditUnits: z.coerce.number().int().min(1).max(30),
    departmentId: uuid,
    passMark: z.number().min(0).max(100).nullable().optional(),
  })
  .strict();
export const courseListQuery = listQuery.extend({ departmentId: optionalUuid });

export const periodBody = z
  .object({
    academicYear: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/, 'Use the format 2025/2026.')
      .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, 'Years must be consecutive.'),
    semester: z.coerce.number().int().min(1).max(3),
    startDate: z.string().date(),
    endDate: z.string().date(),
    status: z.enum(['planned', 'active', 'closed']),
  })
  .strict()
  .refine((v) => v.endDate > v.startDate, { path: ['endDate'], message: 'End date must be after the start date.' });
export const periodListQuery = listQuery.extend({ status: z.enum(['planned', 'active', 'closed']).optional() });

export const assignmentBody = z.object({ lecturerId: uuid, courseId: uuid, academicPeriodId: uuid }).strict();
export const assignmentListQuery = listQuery.extend({
  academicPeriodId: optionalUuid,
  lecturerId: optionalUuid,
  courseId: optionalUuid,
  periodStatus: z.enum(['planned', 'active', 'closed']).optional(),
});

// ---------- enrollments ----------
export const enrollmentCreate = z.object({ studentId: uuid, courseId: uuid, academicPeriodId: uuid }).strict();
export const enrollmentBulk = z
  .object({
    courseId: uuid,
    academicPeriodId: uuid,
    studentIds: z.array(uuid).min(1).max(500).optional(),
    programmeId: uuid.optional(),
    yearOfStudy: yearOfStudy.optional(),
  })
  .strict()
  .refine((v) => v.studentIds || (v.programmeId && v.yearOfStudy), {
    message: 'Provide studentIds, or programmeId with yearOfStudy.',
  });
export const enrollmentUpdate = z.object({ enrollmentStatus: z.enum(['enrolled', 'withdrawn', 'completed']) }).strict();
export const enrollmentListQuery = listQuery.extend({
  academicPeriodId: uuid,
  enrollmentStatus: z.enum(['enrolled', 'withdrawn', 'completed']).optional(),
});

// ---------- results ----------
// Note: no total/grade/status/enteredBy fields — the server computes or sets them.
export const resultCreate = z
  .object({ enrollmentId: uuid, courseworkMark: mark, examinationMark: mark })
  .strict();
export const resultUpdate = z
  .object({
    courseworkMark: mark,
    examinationMark: mark,
    version: z.number().int().min(1),
    reason: z.string().trim().min(5, 'Reason must be at least 5 characters.').max(500).optional(),
  })
  .strict();
export const resultListQuery = listQuery.extend({
  courseId: optionalUuid,
  academicPeriodId: optionalUuid,
  publicationStatus: z.enum(['draft', 'submitted', 'published', 'corrected']).optional(),
  resultStatus: z.enum(['incomplete', 'pass', 'fail']).optional(),
});
export const coursePeriodBody = z.object({ academicPeriodId: uuid }).strict();
export const exportQuery = z
  .object({ academicPeriodId: uuid, format: z.enum(['csv', 'xlsx']).default('csv') })
  .strict();
export const myResultsQuery = z.object({ academicPeriodId: optionalUuid }).strict();

// ---------- coursework assignments ----------
// Course and period are fixed at creation; students are managed through /assignments/:id/students.
const twoDecimals = (n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
const maxMarks = z
  .number({ invalid_type_error: 'Maximum marks must be a number.' })
  .finite()
  .gt(0, 'Maximum marks must be more than 0.')
  .max(1000, 'Maximum marks cannot exceed 1000.')
  .refine(twoDecimals, 'Use at most 2 decimal places.');
const dueAt = z.string().datetime({ offset: true, message: 'Use a valid date and time.' });
const description = z.string().trim().max(5000).nullable().optional();
const studentIdList = z.array(uuid).max(1000, 'Select at most 1000 students at a time.');

export const courseworkCreate = z
  .object({
    title: text(3, 150),
    description,
    courseId: uuid,
    academicPeriodId: uuid,
    dueAt,
    maxMarks,
    studentIds: studentIdList.default([]),
  })
  .strict()
  .refine((v) => new Date(v.dueAt).getTime() > Date.now(), { path: ['dueAt'], message: 'The due date must be in the future.' });
export const courseworkUpdate = z
  .object({ title: text(3, 150), description, dueAt, maxMarks })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });
export const courseworkListQuery = listQuery.extend({ courseId: optionalUuid, academicPeriodId: optionalUuid });
export const eligibleStudentsQuery = z.object({ courseId: uuid, academicPeriodId: uuid }).strict();
export const studentIdsAdd = z.object({ studentIds: studentIdList.min(1, 'Select at least one student.') }).strict();
export const studentIdsSet = z.object({ studentIds: studentIdList }).strict();
export const assignmentStudentParams = z.object({ id: uuid, studentId: uuid }).strict();
export const myAssignmentsQuery = z.object({ academicPeriodId: optionalUuid }).strict();

// ---------- settings ----------
export const evaluationSettingsBody = z
  .object({
    courseworkMax: z.number().min(0).max(100),
    examMax: z.number().min(0).max(100),
    defaultPassMark: z.number().min(0).max(100),
    lecturerCanPublish: z.boolean(),
    lecturerCanCorrect: z.boolean(),
  })
  .strict()
  .refine((v) => v.courseworkMax + v.examMax === 100, {
    path: ['examMax'],
    message: 'Coursework and examination maximums must add up to 100.',
  });

export const gradingScaleQuery = z.object({ academicPeriodId: optionalUuid }).strict();
export const gradingScaleBody = z
  .object({
    academicPeriodId: uuid.nullable(),
    bands: z
      .array(
        z
          .object({
            grade: z.string().trim().toUpperCase().regex(/^[A-Z][+-]?$/, 'Use a letter grade like A, B+ or C-.'),
            minimumMark: z.number().min(0).max(100),
            maximumMark: z.number().min(0).max(100),
            gradePoint: z.number().min(0).max(5).nullable(),
            description: z.string().trim().max(120).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

// ---------- reports / audit ----------
export const reportQuery = listQuery.extend({
  academicPeriodId: optionalUuid,
  courseId: optionalUuid,
  pendingOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export const auditQuery = listQuery.extend({
  entityType: z
    .enum([
      'results', 'profiles', 'students', 'lecturers', 'courses', 'enrollments', 'course_assignments',
      'grading_scales', 'evaluation_settings', 'academic_periods', 'departments', 'programmes', 'auth',
      'assignments', 'assignment_students',
    ])
    .optional(),
  action: z.string().regex(/^[A-Z_]{3,20}$/).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
