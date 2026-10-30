import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { Spinner } from './components/ui/index.js';
import { homePathForRole, useAuth } from './contexts/AuthContext.jsx';
import LoginPage from './pages/public/LoginPage.jsx';
import UnauthorizedPage from './pages/public/UnauthorizedPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';

const ForgotPasswordPage = lazy(() => import('./pages/public/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/public/ResetPasswordPage.jsx'));

const page = (loader) => lazy(loader);

// Admin
const AdminDashboard = page(() => import('./pages/admin/AdminDashboard.jsx'));
const StudentsPage = page(() => import('./pages/admin/StudentsPage.jsx'));
const StudentStatementPage = page(() => import('./pages/admin/StudentStatementPage.jsx'));
const LecturersPage = page(() => import('./pages/admin/LecturersPage.jsx'));
const DepartmentsPage = page(() => import('./pages/admin/DepartmentsPage.jsx'));
const ProgrammesPage = page(() => import('./pages/admin/ProgrammesPage.jsx'));
const CoursesPage = page(() => import('./pages/admin/CoursesPage.jsx'));
const AcademicPeriodsPage = page(() => import('./pages/admin/AcademicPeriodsPage.jsx'));
const AssignmentsPage = page(() => import('./pages/admin/AssignmentsPage.jsx'));
const EnrollmentsPage = page(() => import('./pages/admin/EnrollmentsPage.jsx'));
const GradingPage = page(() => import('./pages/admin/GradingPage.jsx'));
const PublicationPage = page(() => import('./pages/admin/PublicationPage.jsx'));
const ReportsPage = page(() => import('./pages/admin/ReportsPage.jsx'));
const AuditLogsPage = page(() => import('./pages/admin/AuditLogsPage.jsx'));
// Shared staff
const ResultsBrowserPage = page(() => import('./pages/lecturer/ResultsBrowserPage.jsx'));
const MarksEntryPage = page(() => import('./pages/lecturer/MarksEntryPage.jsx'));
const CourseworkPage = page(() => import('./pages/lecturer/CourseworkPage.jsx'));
// Lecturer
const LecturerDashboard = page(() => import('./pages/lecturer/LecturerDashboard.jsx'));
const MyCoursesPage = page(() => import('./pages/lecturer/MyCoursesPage.jsx'));
const CourseStudentsPage = page(() => import('./pages/lecturer/CourseStudentsPage.jsx'));
// Student
const StudentDashboard = page(() => import('./pages/student/StudentDashboard.jsx'));
const MyResultsPage = page(() => import('./pages/student/MyResultsPage.jsx'));
const PerformancePage = page(() => import('./pages/student/PerformancePage.jsx'));
const StatementPage = page(() => import('./pages/student/StatementPage.jsx'));
const StudentAssignmentsPage = page(() => import('./pages/student/AssignmentsPage.jsx'));
const StudentAssignmentDetailPage = page(() => import('./pages/student/AssignmentDetailPage.jsx'));
// Any role
const ProfilePage = page(() => import('./pages/ProfilePage.jsx'));

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="min-h-screen" />;
  return <Navigate to={user ? homePathForRole(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-[50vh]" />}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/profile" element={<ProfilePage />} />

            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/students" element={<StudentsPage />} />
              <Route path="/admin/students/:id/statement" element={<StudentStatementPage />} />
              <Route path="/admin/lecturers" element={<LecturersPage />} />
              <Route path="/admin/departments" element={<DepartmentsPage />} />
              <Route path="/admin/programmes" element={<ProgrammesPage />} />
              <Route path="/admin/courses" element={<CoursesPage />} />
              <Route path="/admin/academic-periods" element={<AcademicPeriodsPage />} />
              <Route path="/admin/assignments" element={<AssignmentsPage />} />
              <Route path="/admin/enrollments" element={<EnrollmentsPage />} />
              <Route path="/admin/coursework" element={<CourseworkPage />} />
              <Route path="/admin/results" element={<ResultsBrowserPage />} />
              <Route path="/admin/courses/:courseId/periods/:periodId/marks" element={<MarksEntryPage />} />
              <Route path="/admin/publication" element={<PublicationPage />} />
              <Route path="/admin/grading" element={<GradingPage />} />
              <Route path="/admin/reports" element={<ReportsPage />} />
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            </Route>

            <Route element={<ProtectedRoute roles={['lecturer']} />}>
              <Route path="/lecturer" element={<LecturerDashboard />} />
              <Route path="/lecturer/courses" element={<MyCoursesPage />} />
              <Route path="/lecturer/courses/:courseId/periods/:periodId/students" element={<CourseStudentsPage />} />
              <Route path="/lecturer/courses/:courseId/periods/:periodId/marks" element={<MarksEntryPage />} />
              <Route path="/lecturer/assignments" element={<CourseworkPage />} />
              <Route path="/lecturer/results" element={<ResultsBrowserPage />} />
              <Route path="/lecturer/reports" element={<ReportsPage />} />
            </Route>

            <Route element={<ProtectedRoute roles={['student']} />}>
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/results" element={<MyResultsPage />} />
              <Route path="/student/performance" element={<PerformancePage />} />
              <Route path="/student/statement" element={<StatementPage />} />
              <Route path="/student/assignments" element={<StudentAssignmentsPage />} />
              <Route path="/student/assignments/:id" element={<StudentAssignmentDetailPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
