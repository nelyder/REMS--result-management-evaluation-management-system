import { check, notFound } from '../utils/httpError.js';
import { applySort, listMeta, pageRange, searchFilter } from '../utils/query.js';
import { mapCourse, mapDepartment, mapPeriod, mapProgramme, mapAssignment } from '../utils/mappers.js';

/**
 * Small CRUD factory for reference tables. `toRow` whitelists writable columns,
 * so request bodies never reach the database unfiltered.
 */
function crud({ table, readFrom = table, select = '*', map, toRow, searchColumns = [], sortMap = {}, defaultSort, filters = {}, conflictMessage }) {
  return {
    async list(db, q) {
      const { from, to } = pageRange(q);
      let query = db.from(readFrom).select(select, { count: 'exact' });
      const or = searchFilter(q.search, searchColumns);
      if (or) query = query.or(or);
      for (const [param, column] of Object.entries(filters)) {
        if (q[param] !== undefined) query = query.eq(column, q[param]);
      }
      query = applySort(query, q, sortMap, defaultSort).range(from, to);
      const { data, count } = check(await query);
      return { data: data.map(map), meta: listMeta(q, count) };
    },
    async get(db, id) {
      const { data } = check(await db.from(readFrom).select(select).eq('id', id).maybeSingle());
      if (!data) throw notFound();
      return map(data);
    },
    async create(db, body) {
      const { data } = check(await db.from(table).insert(toRow(body)).select('id').single(), { conflictMessage });
      return this.get(db, data.id);
    },
    async update(db, id, body) {
      const { data } = check(await db.from(table).update(toRow(body)).eq('id', id).select('id').maybeSingle(), {
        conflictMessage,
      });
      if (!data) throw notFound();
      return this.get(db, id);
    },
    async remove(db, id) {
      const { data } = check(await db.from(table).delete().eq('id', id).select('id').maybeSingle());
      if (!data) throw notFound();
    },
  };
}

export const departments = crud({
  table: 'departments',
  map: mapDepartment,
  toRow: (b) => ({ department_name: b.name, department_code: b.code }),
  searchColumns: ['department_name', 'department_code'],
  sortMap: { name: 'department_name', code: 'department_code' },
  defaultSort: { column: 'department_code' },
  conflictMessage: 'A department with this code already exists.',
});

export const programmes = crud({
  table: 'programmes',
  select: '*, department:departments(id, department_name, department_code)',
  map: mapProgramme,
  toRow: (b) => ({ programme_name: b.name, programme_code: b.code, department_id: b.departmentId }),
  searchColumns: ['programme_name', 'programme_code'],
  sortMap: { name: 'programme_name', code: 'programme_code' },
  defaultSort: { column: 'programme_code' },
  filters: { departmentId: 'department_id' },
  conflictMessage: 'A programme with this code already exists.',
});

export const courses = crud({
  table: 'courses',
  select: '*, department:departments(id, department_name, department_code)',
  map: mapCourse,
  toRow: (b) => ({
    course_code: b.code,
    course_name: b.name,
    credit_units: b.creditUnits,
    department_id: b.departmentId,
    pass_mark: b.passMark ?? null,
  }),
  searchColumns: ['course_code', 'course_name'],
  sortMap: { code: 'course_code', name: 'course_name', creditUnits: 'credit_units' },
  defaultSort: { column: 'course_code' },
  filters: { departmentId: 'department_id' },
  conflictMessage: 'A course with this code already exists.',
});

/**
 * Deletes a course and its enrollments in one transaction (`delete_course`), refusing (422)
 * if any marks were entered or coursework exists. Returns the number of enrollments removed.
 */
courses.remove = async (db, id) => {
  const { data } = check(await db.rpc('delete_course', { p_course_id: id }), {
    referencedMessage: 'This course is still referenced by other records and cannot be deleted.',
  });
  return data;
};

export const periods = crud({
  table: 'academic_periods',
  map: mapPeriod,
  toRow: (b) => ({
    academic_year: b.academicYear,
    semester: b.semester,
    start_date: b.startDate,
    end_date: b.endDate,
    status: b.status,
  }),
  searchColumns: ['academic_year'],
  sortMap: { academicYear: 'academic_year', startDate: 'start_date' },
  defaultSort: { column: 'start_date', ascending: false },
  filters: { status: 'status' },
  conflictMessage: 'This academic year and semester already exists.',
});

export const assignments = crud({
  table: 'course_assignments',
  readFrom: 'assignment_details',
  map: mapAssignment,
  toRow: (b) => ({ lecturer_id: b.lecturerId, course_id: b.courseId, academic_period_id: b.academicPeriodId }),
  searchColumns: ['course_code', 'course_name', 'lecturer_name'],
  sortMap: { course: 'course_code', lecturer: 'lecturer_name' },
  defaultSort: { column: 'start_date', ascending: false },
  filters: {
    academicPeriodId: 'academic_period_id',
    lecturerId: 'lecturer_id',
    courseId: 'course_id',
    periodStatus: 'period_status',
  },
  conflictMessage: 'This lecturer is already assigned to the course for that period.',
});

/** Lecturer's own assignments — lecturer id comes from the verified session, never the client. */
export async function myAssignments(db, user, q) {
  let query = db
    .from('assignment_details')
    .select('*')
    .eq('lecturer_id', user.lecturerId)
    .order('start_date', { ascending: false })
    .order('course_code');
  if (q.academicPeriodId) query = query.eq('academic_period_id', q.academicPeriodId);
  if (q.periodStatus) query = query.eq('period_status', q.periodStatus);
  const { data } = check(await query);
  return { data: data.map(mapAssignment) };
}
