// Form and dashboard workflows. Services and auth are mocked; data is fictional.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    auth: {
      user: null,
      loading: false,
      recovery: false,
      signIn: fn(),
      signOut: fn(),
      requestPasswordReset: fn(),
      setNewPassword: fn(),
      changePassword: fn(),
    },
    services: {
      enrollmentsService: { forCourse: fn() },
      settingsService: { getEvaluation: fn(), getGradingScales: fn() },
      resultsService: { save: fn(), update: fn(), get: fn(), publishCourse: fn(), submitCourse: fn(), exportCourse: fn() },
      studentsService: { list: fn(), create: fn(), update: fn(), statement: fn(), myAssignments: fn(), myAssignment: fn() },
      assignmentsService: { mine: fn() },
      courseworkService: {
        list: fn(), create: fn(), update: fn(), remove: fn(), eligibleForOffering: fn(), eligible: fn(),
        students: fn(), addStudents: fn(), removeStudent: fn(),
      },
      programmesService: { list: fn() },
      departmentsService: { list: fn() },
      coursesService: { list: fn() },
      lecturersService: { list: fn() },
      periodsService: { list: fn() },
      reportsService: { overview: fn(), coursePerformance: fn(), gradeDistribution: fn() },
      auditService: { list: fn() },
      usersService: { setStatus: fn() },
    },
  };
});

vi.mock('../src/contexts/AuthContext.jsx', () => ({
  useAuth: () => mocks.auth,
  homePathForRole: (role) => ({ admin: '/admin', lecturer: '/lecturer', student: '/student' })[role] || '/login',
}));
vi.mock('../src/services/supabase.js', () => ({
  supabase: null,
  isSupabaseConfigured: true,
  recoveryLink: { opened: false, error: null },
}));
vi.mock('../src/services/index.js', () => mocks.services);

const { ToastProvider } = await import('../src/contexts/ToastContext.jsx');
const { ThemeProvider } = await import('../src/contexts/ThemeContext.jsx');
const { ApiError } = await import('../src/services/api.js');
const { default: MarksEntryPage } = await import('../src/pages/lecturer/MarksEntryPage.jsx');
const { default: StudentsPage } = await import('../src/pages/admin/StudentsPage.jsx');
const { default: AdminDashboard } = await import('../src/pages/admin/AdminDashboard.jsx');
const { default: StudentStatementPage } = await import('../src/pages/admin/StudentStatementPage.jsx');
const { default: ForgotPasswordPage } = await import('../src/pages/public/ForgotPasswordPage.jsx');
const { default: ResetPasswordPage } = await import('../src/pages/public/ResetPasswordPage.jsx');
const { default: LoginPage } = await import('../src/pages/public/LoginPage.jsx');
const { ChangePasswordForm } = await import('../src/components/ChangePasswordForm.jsx');
const { default: CourseworkPage } = await import('../src/pages/lecturer/CourseworkPage.jsx');
const { default: StudentAssignmentsPage } = await import('../src/pages/student/AssignmentsPage.jsx');
const { default: StudentAssignmentDetailPage } = await import('../src/pages/student/AssignmentDetailPage.jsx');

const s = mocks.services;
const ok = (data, meta) => Promise.resolve({ data, meta });
const period = { id: 'p1', academicYear: '2026/2027', semester: 1, startDate: '2026-09-01' };

function renderAt(path, routePath, element, extraRoutes = null) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
            {extraRoutes}
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.auth, { user: null, loading: false, recovery: false });
});

// ---------------------------------------------------------------- marks entry
describe('MarksEntryPage', () => {
  let settings;
  const enrollment = (id, name, reg, result = null) => ({
    id,
    student: { fullName: name, registrationNumber: reg },
    result,
  });

  beforeEach(() => {
    mocks.auth.user = { role: 'lecturer', fullName: 'Lena Okafor' };
    settings = { courseworkMax: 40, examMax: 60, defaultPassMark: 50, lecturerCanPublish: false, lecturerCanCorrect: false };
    s.settingsService.getEvaluation.mockImplementation(() => ok(settings));
    s.settingsService.getGradingScales.mockImplementation(() =>
      ok({
        bands: [
          { grade: 'A', minimumMark: 80, maximumMark: 100 },
          { grade: 'B', minimumMark: 70, maximumMark: 79.99 },
          { grade: 'C', minimumMark: 50, maximumMark: 69.99 },
          { grade: 'F', minimumMark: 0, maximumMark: 49.99 },
        ],
      }),
    );
    s.enrollmentsService.forCourse.mockImplementation(() =>
      ok(
        [
          enrollment('e1', 'Amina Test', 'REG/2025/0001'),
          enrollment('e2', 'Brian Sample', 'REG/2025/0002', {
            id: 'r2', courseworkMark: 20, examinationMark: 30, totalMark: 50, grade: 'C',
            resultStatus: 'pass', publicationStatus: 'draft', version: 3,
          }),
        ],
        { course: { code: 'CSC 101', name: 'Introduction to Programming', passMark: null }, academicPeriod: period },
      ),
    );
  });

  const renderMarks = () => renderAt('/lecturer/courses/c1/periods/p1/marks', '/lecturer/courses/:courseId/periods/:periodId/marks', <MarksEntryPage />);
  const row = async (name) => (await screen.findByText(name)).closest('tr');

  it('previews total, grade and result while typing, then saves marks only', async () => {
    s.resultsService.save.mockResolvedValue({ data: { id: 'r1', courseworkMark: 30, examinationMark: 45, totalMark: 75, grade: 'B', resultStatus: 'pass', publicationStatus: 'draft', version: 1 } });
    renderMarks();
    const r = await row('Amina Test');
    await userEvent.type(within(r).getByLabelText('Coursework mark for Amina Test'), '30');
    await userEvent.type(within(r).getByLabelText('Exam mark for Amina Test'), '45');
    expect(within(r).getByText('75')).toBeInTheDocument();
    expect(within(r).getByText('B')).toBeInTheDocument();
    expect(within(r).getByText('Pass')).toBeInTheDocument();

    await userEvent.click(within(r).getByRole('button', { name: 'Save' }));
    // Only marks go to the API; total/grade/status are computed by the server.
    expect(s.resultsService.save).toHaveBeenCalledWith({ enrollmentId: 'e1', courseworkMark: 30, examinationMark: 45 });
  });

  it('loads every page of a large class and hides only withdrawn students', async () => {
    const meta = { total: 101, course: { code: 'CSC 101', name: 'Introduction to Programming', passMark: null }, academicPeriod: period };
    const first = Array.from({ length: 100 }, (_, i) => ({ ...enrollment(`e${i}`, `Student ${i}`, `REG/2025/${String(i).padStart(4, '0')}`), enrollmentStatus: 'enrolled' }));
    s.enrollmentsService.forCourse.mockImplementation((_course, params) =>
      params.page === 1
        ? ok([...first.slice(0, 98), { ...first[98], enrollmentStatus: 'completed' }, { ...first[99], enrollmentStatus: 'withdrawn' }], meta)
        : ok([{ ...enrollment('e100', 'Last Student', 'REG/2025/0100'), enrollmentStatus: 'enrolled' }], meta),
    );
    renderMarks();
    expect(await screen.findByText('Last Student')).toBeInTheDocument();
    expect(screen.getByText('Student 98')).toBeInTheDocument(); // completed enrollments keep their results visible
    expect(screen.queryByText('Student 99')).not.toBeInTheDocument(); // withdrawn
    expect(s.enrollmentsService.forCourse).toHaveBeenCalledWith('c1', expect.objectContaining({ page: 2, pageSize: 100 }));
  });

  it('rejects a mark above the configured maximum without calling the API', async () => {
    renderMarks();
    const r = await row('Amina Test');
    await userEvent.type(within(r).getByLabelText('Coursework mark for Amina Test'), '45');
    expect(within(r).getByText('Coursework cannot exceed 40')).toBeInTheDocument();
    await userEvent.click(within(r).getByRole('button', { name: 'Save' }));
    expect(s.resultsService.save).not.toHaveBeenCalled();
  });

  it('treats a missing exam mark as incomplete, not zero', async () => {
    s.resultsService.save.mockResolvedValue({ data: { id: 'r1', courseworkMark: 30, examinationMark: null, totalMark: null, grade: null, resultStatus: 'incomplete', publicationStatus: 'draft', version: 1 } });
    renderMarks();
    const r = await row('Amina Test');
    await userEvent.type(within(r).getByLabelText('Coursework mark for Amina Test'), '30');
    expect(within(r).getByText('Incomplete')).toBeInTheDocument();
    await userEvent.click(within(r).getByRole('button', { name: 'Save' }));
    expect(s.resultsService.save).toHaveBeenCalledWith({ enrollmentId: 'e1', courseworkMark: 30, examinationMark: null });
  });

  it('sends the last-seen version and reloads the row on a 409 conflict', async () => {
    s.resultsService.update.mockRejectedValue(new ApiError('Conflict', { status: 409 }));
    s.resultsService.get.mockResolvedValue({ data: { id: 'r2', courseworkMark: 25, examinationMark: 30, totalMark: 55, grade: 'C', resultStatus: 'pass', publicationStatus: 'draft', version: 4 } });
    renderMarks();
    const r = await row('Brian Sample');
    const cw = within(r).getByLabelText('Coursework mark for Brian Sample');
    await userEvent.clear(cw);
    await userEvent.type(cw, '22');
    await userEvent.click(within(r).getByRole('button', { name: 'Save' }));
    expect(s.resultsService.update).toHaveBeenCalledWith('r2', { courseworkMark: 22, examinationMark: 30, version: 3 });
    expect(await screen.findByText(/changed by someone else/)).toBeInTheDocument();
    expect(s.resultsService.get).toHaveBeenCalledWith('r2');
    expect(within(r).getByLabelText('Coursework mark for Brian Sample')).toHaveValue(25);
  });

  it('offers submit (not publish) when lecturers may not publish', async () => {
    renderMarks();
    expect(await screen.findByRole('button', { name: /submit for publication/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^publish/i })).not.toBeInTheDocument();
  });

  it('offers publish when the setting allows lecturers to publish', async () => {
    settings.lecturerCanPublish = true;
    renderMarks();
    expect(await screen.findByRole('button', { name: /^publish \(1\)/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- admin forms
describe('StudentsPage create form', () => {
  beforeEach(() => {
    mocks.auth.user = { role: 'admin', fullName: 'Ada Admin' };
    s.studentsService.list.mockImplementation(() => ok([], { page: 1, pageSize: 20, total: 0 }));
    s.programmesService.list.mockImplementation(() => ok([{ id: 'pr1', code: 'BSC-CS', name: 'BSc Computer Science' }]));
    s.studentsService.create.mockResolvedValue({ data: { id: 's1' } });
  });

  it('validates required fields and password length before calling the API', async () => {
    renderAt('/admin/students', '/admin/students', <StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /save|create/i }));
    expect(within(dialog).getByText('Full name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Temporary password is required')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/temporary password/i), 'short');
    await userEvent.click(within(dialog).getByRole('button', { name: /save|create/i }));
    expect(within(dialog).getByText('Use at least 10 characters')).toBeInTheDocument();
    expect(s.studentsService.create).not.toHaveBeenCalled();
  });

  it('sends only whitelisted fields (no role) when creating a student', async () => {
    renderAt('/admin/students', '/admin/students', <StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/full name/i), 'Amina Test');
    await userEvent.type(within(dialog).getByLabelText(/^email/i), 'amina@example.edu');
    await userEvent.type(within(dialog).getByLabelText(/registration number/i), 'REG/2025/0009');
    await within(dialog).findByRole('option', { name: 'BSC-CS — BSc Computer Science' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^programme/i), 'pr1');
    await userEvent.type(within(dialog).getByLabelText(/temporary password/i), 'Temp-Password-1');
    await userEvent.click(within(dialog).getByRole('button', { name: /save|create/i }));
    expect(s.studentsService.create).toHaveBeenCalledWith({
      fullName: 'Amina Test',
      registrationNumber: 'REG/2025/0009',
      programmeId: 'pr1',
      yearOfStudy: 1,
      email: 'amina@example.edu',
      password: 'Temp-Password-1',
    });
    expect(await screen.findByText('Student created.')).toBeInTheDocument();
  });

  it('links each student to their result statement', async () => {
    s.studentsService.list.mockImplementation(() =>
      ok([{ id: 's1', profileId: 'u1', fullName: 'Amina Test', email: 'a@example.edu', registrationNumber: 'REG/2025/0001', programme: { code: 'BSC-CS' }, yearOfStudy: 1, accountStatus: 'active' }], { page: 1, pageSize: 20, total: 1 }),
    );
    renderAt('/admin/students', '/admin/students', <StudentsPage />);
    expect(await screen.findByRole('link', { name: 'Result statement for Amina Test' })).toHaveAttribute('href', '/admin/students/s1/statement');
  });
});

// ---------------------------------------------------------------- dashboards / statements
describe('AdminDashboard', () => {
  it('shows institution totals and recent activity', async () => {
    mocks.auth.user = { role: 'admin', fullName: 'Ada Admin' };
    s.reportsService.overview.mockImplementation(() => ok({ students: 8, activeStudents: 7, lecturers: 2, courses: 6, publishedResults: 22, passRate: 0.75 }));
    s.reportsService.coursePerformance.mockImplementation(() => ok([]));
    s.reportsService.gradeDistribution.mockImplementation(() => ok([{ grade: 'A', count: 3 }, { grade: 'F', count: 1 }]));
    s.auditService.list.mockImplementation(() => ok([{ id: 1, action: 'PUBLISH', entityType: 'results', createdAt: '2026-10-29T10:00:00Z', actor: { fullName: 'Lena Okafor' } }]));
    renderAt('/admin', '/admin', <AdminDashboard />);
    expect(await screen.findByText('Welcome, Ada')).toBeInTheDocument();
    expect(await screen.findByText('22')).toBeInTheDocument();
    expect(screen.getByText('75.0% pass rate')).toBeInTheDocument();
    expect(screen.getByText('7 active')).toBeInTheDocument();
    expect(await screen.findByText('Lena Okafor')).toBeInTheDocument();
    expect(screen.getByText('Nothing is waiting for publication.')).toBeInTheDocument();
  });
});

describe('StudentStatementPage', () => {
  it('shows the selected student and their published results', async () => {
    mocks.auth.user = { role: 'admin', fullName: 'Ada Admin' };
    s.studentsService.statement.mockImplementation(() =>
      ok({
        student: { id: 's1', fullName: 'Amina Test', registrationNumber: 'REG/2025/0001', programme: { code: 'BSC-CS', name: 'BSc Computer Science' }, yearOfStudy: 1 },
        results: [{
          id: 'r1', course: { code: 'CSC 101', name: 'Introduction to Programming', creditUnits: 4 }, academicPeriod: period,
          courseworkMark: 30, examinationMark: 45, totalMark: 75, grade: 'B', resultStatus: 'pass', publicationStatus: 'published',
        }],
        summary: { periods: [], cumulative: { courses: 1, creditsEarned: 4, creditsAttempted: 4, average: 75, gpa: 3.5 } },
      }),
    );
    renderAt('/admin/students/s1/statement', '/admin/students/:id/statement', <StudentStatementPage />);
    expect(await screen.findByRole('heading', { name: 'Statement — Amina Test' })).toBeInTheDocument();
    expect(s.studentsService.statement).toHaveBeenCalledWith('s1');
    expect(screen.getByText('Introduction to Programming')).toBeInTheDocument();
    expect(screen.getByText(/CGPA 3.5/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------- passwords
describe('password reset and change', () => {
  it('requests a reset link and shows the same message whether or not the account exists', async () => {
    mocks.auth.requestPasswordReset.mockResolvedValue();
    renderAt('/forgot-password', '/forgot-password', <ForgotPasswordPage />);
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/email address/i), 'Amina@Example.edu');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(mocks.auth.requestPasswordReset).toHaveBeenCalledWith('amina@example.edu');
    expect(await screen.findByRole('status')).toHaveTextContent(/if an account exists/i);
  });

  it('refuses to set a password without a recovery session', () => {
    renderAt('/reset-password', '/reset-password', <ResetPasswordPage />);
    expect(screen.getByRole('heading', { name: 'Link not valid' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('sets a new password from the recovery link, then signs out to the login page', async () => {
    mocks.auth.recovery = true;
    mocks.auth.setNewPassword.mockResolvedValue();
    mocks.auth.signOut.mockResolvedValue();
    renderAt('/reset-password', '/reset-password', <ResetPasswordPage />, <Route path="/login" element={<LoginPage />} />);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'New-Password-1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'Different-1');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(mocks.auth.setNewPassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/confirm new password/i));
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'New-Password-1');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    expect(mocks.auth.setNewPassword).toHaveBeenCalledWith('New-Password-1');
    expect(mocks.auth.signOut).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Password updated');
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('changes the password only after the current password is given', async () => {
    mocks.auth.changePassword.mockResolvedValue();
    renderAt('/profile', '/profile', <ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/^new password/i), 'New-Password-1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'New-Password-1');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(screen.getByText('Enter your current password')).toBeInTheDocument();
    expect(mocks.auth.changePassword).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/current password/i), 'Old-Password-1');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(mocks.auth.changePassword).toHaveBeenCalledWith('Old-Password-1', 'New-Password-1');
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  it('shows the server message when the current password is wrong', async () => {
    mocks.auth.changePassword.mockRejectedValue(new Error('Your current password is incorrect.'));
    renderAt('/profile', '/profile', <ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/current password/i), 'wrong-one');
    await userEvent.type(screen.getByLabelText(/^new password/i), 'New-Password-1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'New-Password-1');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect.');
  });
});

// ---------------------------------------------------------------- coursework assignments
describe('Assignment dialog', () => {
  const student = (id, name, reg, assigned = false) => ({
    studentId: id,
    enrollmentId: `e-${id}`,
    enrollmentStatus: 'enrolled',
    assigned,
    student: { id, fullName: name, registrationNumber: reg, programmeCode: 'BSC-CS', yearOfStudy: 1 },
  });
  const amina = student('s1', 'Amina Test', 'REG/2025/0001');
  const brian = student('s2', 'Brian Sample', 'REG/2025/0002');
  const chidi = student('s3', 'Chidi Example', 'REG/2025/0003');
  const assignment = {
    id: 'a1',
    title: 'Essay on sorting',
    description: 'Compare merge sort and quicksort.',
    courseId: 'c1',
    academicPeriodId: 'p1',
    course: { id: 'c1', code: 'CSC 201', name: 'Data Structures' },
    academicPeriod: period,
    dueAt: '2099-05-01T12:00:00.000Z',
    maxMarks: 20,
    assignedCount: 2,
  };
  const linked = (st) => ({ id: `l-${st.studentId}`, studentId: st.studentId, status: 'assigned', student: st.student });

  beforeEach(() => {
    mocks.auth.user = { role: 'lecturer', fullName: 'Lena Okafor' };
    s.assignmentsService.mine.mockImplementation(() =>
      ok([{ id: 'ca1', courseId: 'c1', course: { code: 'CSC 201', name: 'Data Structures' }, academicPeriodId: 'p1', academicPeriod: period }]),
    );
    s.courseworkService.list.mockImplementation(() => ok([], { page: 1, pageSize: 20, total: 0 }));
    s.courseworkService.eligibleForOffering.mockImplementation(() => ok([amina, brian, chidi]));
  });

  const renderPage = () => renderAt('/lecturer/assignments', '/lecturer/assignments', <CourseworkPage />);
  const openCreate = async () => {
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Add assignment' }))[0]);
    return screen.getByRole('dialog', { name: 'Add assignment' });
  };

  it('creates an assignment for exactly the selected students', async () => {
    s.courseworkService.create.mockResolvedValue({ data: { id: 'a9' } });
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText(/assignment title/i), 'Essay on sorting');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^course/i), 'c1');

    // The only year and semester for this course are picked automatically.
    expect(await within(dialog).findByText('Amina Test')).toBeInTheDocument();
    expect(s.courseworkService.eligibleForOffering).toHaveBeenCalledWith({ courseId: 'c1', academicPeriodId: 'p1' });

    // Search narrows the list; select-all applies to the matches only.
    await userEvent.type(within(dialog).getByLabelText('Search students'), 'brian');
    expect(within(dialog).queryByRole('checkbox', { name: /Amina Test/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText('Select all 1 matching'));
    expect(within(dialog).getByText('1 selected')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Search students'));
    await userEvent.click(within(dialog).getByLabelText('Select all 3 students'));
    expect(within(dialog).getByText('3 selected')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /selected \(3\)/i })).toBeInTheDocument();

    // Deselect from the selected list before saving.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Chidi Example from selection' }));
    expect(within(dialog).getByText('2 selected')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Chidi Example/)).not.toBeChecked();

    fireEvent.change(within(dialog).getByLabelText(/due date/i), { target: { value: '2099-05-01T12:00' } });
    await userEvent.type(within(dialog).getByLabelText(/maximum marks/i), '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create assignment' }));

    expect(s.courseworkService.create).toHaveBeenCalledTimes(1);
    const body = s.courseworkService.create.mock.calls[0][0];
    expect(body).toMatchObject({
      title: 'Essay on sorting',
      description: null,
      courseId: 'c1',
      academicPeriodId: 'p1',
      dueAt: new Date('2099-05-01T12:00').toISOString(),
      maxMarks: 20,
    });
    expect([...body.studentIds].sort()).toEqual(['s1', 's2']);
    expect(await screen.findByText('Assignment created and assigned to 2 students.')).toBeInTheDocument();
  });

  it('validates the details before calling the API', async () => {
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create assignment' }));
    expect(within(dialog).getByText('Enter a title of at least 3 characters')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a course')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a due date and time')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a number from 0.01 to 1000')).toBeInTheDocument();
    expect(s.courseworkService.create).not.toHaveBeenCalled();
  });

  it('confirms before removing an assigned student and updates the list immediately', async () => {
    s.courseworkService.list.mockImplementation(() => ok([assignment], { page: 1, pageSize: 20, total: 1 }));
    s.courseworkService.students.mockImplementation(() => ok([linked(amina), linked(brian)]));
    s.courseworkService.eligible.mockImplementation(() => ok([{ ...amina, assigned: true }, { ...brian, assigned: true }, chidi]));
    s.courseworkService.removeStudent.mockResolvedValue({ data: { removedStudentId: 's1', students: [linked(brian)] } });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Essay on sorting' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage assignment' });
    const assignedList = await within(dialog).findByRole('list', { name: 'Currently assigned students' });
    expect(within(assignedList).getAllByRole('listitem')).toHaveLength(2);

    // Escape closes only the confirmation, not the dialog underneath; nothing is removed.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Amina Test from this assignment' }));
    expect(screen.getByRole('dialog', { name: 'Remove student from assignment?' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Remove student from assignment?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Manage assignment' })).toBeInTheDocument();
    expect(s.courseworkService.removeStudent).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Amina Test from this assignment' }));
    const confirm = screen.getByRole('dialog', { name: 'Remove student from assignment?' });
    expect(confirm).toHaveTextContent(/account, enrollment and results are not affected/i);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));

    expect(s.courseworkService.removeStudent).toHaveBeenCalledWith('a1', 's1');
    expect(await screen.findByText('Amina Test removed from the assignment.')).toBeInTheDocument();
    expect(within(assignedList).getAllByRole('listitem')).toHaveLength(1);
    expect(within(assignedList).queryByText('Amina Test')).not.toBeInTheDocument();
    // She can be picked again.
    expect(within(dialog).getByLabelText(/Amina Test/)).not.toBeChecked();
  });

  it('adds newly selected students when saving an existing assignment', async () => {
    s.courseworkService.list.mockImplementation(() => ok([assignment], { page: 1, pageSize: 20, total: 1 }));
    s.courseworkService.students.mockImplementation(() => ok([linked(amina)]));
    s.courseworkService.eligible.mockImplementation(() => ok([{ ...amina, assigned: true }, brian, chidi]));
    s.courseworkService.update.mockResolvedValue({ data: assignment });
    s.courseworkService.addStudents.mockResolvedValue({ data: { added: 1, skipped: 0, students: [] } });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage Essay on sorting' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage assignment' });
    // Already-assigned students are not offered again (no duplicates).
    await within(dialog).findByLabelText(/Brian Sample/);
    expect(within(dialog).queryByRole('checkbox', { name: /Amina Test/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByLabelText(/Brian Sample/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save and add 1' }));
    expect(s.courseworkService.update).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'Essay on sorting', maxMarks: 20 }));
    expect(s.courseworkService.addStudents).toHaveBeenCalledWith('a1', ['s2']);
  });
});

describe('student assignments', () => {
  beforeEach(() => {
    mocks.auth.user = { role: 'student', fullName: 'Amina Test' };
  });

  it('lists the assignments the API returns for the student', async () => {
    s.studentsService.myAssignments.mockImplementation(() =>
      ok([{ id: 'a1', title: 'Essay on sorting', course: { code: 'CSC 201', name: 'Data Structures' }, academicPeriod: period, dueAt: '2099-05-01T12:00:00.000Z', maxMarks: 20 }]),
    );
    renderAt('/student/assignments', '/student/assignments', <StudentAssignmentsPage />);
    expect(await screen.findByText('Essay on sorting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Essay on sorting/ })).toHaveAttribute('href', '/student/assignments/a1');
  });

  it('shows "not available" once the student has been removed', async () => {
    s.studentsService.myAssignment.mockRejectedValue(new ApiError('Assignment not found.', { status: 404 }));
    renderAt('/student/assignments/a1', '/student/assignments/:id', <StudentAssignmentDetailPage />);
    expect(await screen.findByText('This assignment is not available')).toBeInTheDocument();
  });
});
