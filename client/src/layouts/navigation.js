import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Send,
  SlidersHorizontal,
  TrendingUp,
  UserCircle,
  UserPlus,
  Users,
  Library,
  Link2,
} from 'lucide-react';

export const navigation = {
  admin: [
    {
      section: 'Overview',
      items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }],
    },
    {
      section: 'People',
      items: [
        { to: '/admin/students', label: 'Students', icon: GraduationCap },
        { to: '/admin/lecturers', label: 'Lecturers', icon: Users },
      ],
    },
    {
      section: 'Academic setup',
      items: [
        { to: '/admin/departments', label: 'Departments', icon: Building2 },
        { to: '/admin/programmes', label: 'Programmes', icon: Library },
        { to: '/admin/courses', label: 'Courses', icon: BookOpen },
        { to: '/admin/academic-periods', label: 'Academic periods', icon: CalendarRange },
        { to: '/admin/assignments', label: 'Course assignments', icon: Link2 },
        { to: '/admin/enrollments', label: 'Enrollments', icon: UserPlus },
      ],
    },
    {
      section: 'Results',
      items: [
        { to: '/admin/results', label: 'All results', icon: ClipboardList },
        { to: '/admin/publication', label: 'Publication', icon: Send },
        { to: '/admin/grading', label: 'Grading rules', icon: SlidersHorizontal },
        { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
        { to: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
      ],
    },
    { section: 'Account', items: [{ to: '/profile', label: 'Profile', icon: UserCircle }] },
  ],
  lecturer: [
    {
      section: 'Overview',
      items: [{ to: '/lecturer', label: 'Dashboard', icon: LayoutDashboard, end: true }],
    },
    {
      section: 'Teaching',
      items: [
        { to: '/lecturer/courses', label: 'My courses', icon: BookOpen },
        { to: '/lecturer/results', label: 'Results', icon: ClipboardCheck },
        { to: '/lecturer/reports', label: 'Course performance', icon: BarChart3 },
      ],
    },
    { section: 'Account', items: [{ to: '/profile', label: 'Profile', icon: UserCircle }] },
  ],
  student: [
    {
      section: 'Overview',
      items: [{ to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true }],
    },
    {
      section: 'Academics',
      items: [
        { to: '/student/results', label: 'My results', icon: ListChecks },
        { to: '/student/performance', label: 'Performance', icon: TrendingUp },
        { to: '/student/statement', label: 'Result statement', icon: FileText },
      ],
    },
    { section: 'Account', items: [{ to: '/profile', label: 'Profile', icon: UserCircle }] },
  ],
};
