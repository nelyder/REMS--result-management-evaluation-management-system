import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const authState = { user: null, loading: false, signIn: vi.fn(), signOut: vi.fn() };
vi.mock('../src/contexts/AuthContext.jsx', () => ({
  useAuth: () => authState,
  homePathForRole: (role) => ({ admin: '/admin', lecturer: '/lecturer', student: '/student' })[role] || '/login',
}));
vi.mock('../src/services/supabase.js', () => ({ supabase: null, isSupabaseConfigured: true }));

const { ProtectedRoute } = await import('../src/components/ProtectedRoute.jsx');
const { default: LoginPage } = await import('../src/pages/public/LoginPage.jsx');
const { ConfirmDialog } = await import('../src/components/ui/index.js');

function renderGuard(path, roles) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/unauthorized" element={<p>unauthorized page</p>} />
        <Route element={<ProtectedRoute roles={roles} />}>
          <Route path="/admin" element={<p>admin area</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.user = null;
  authState.signIn.mockReset();
});

describe('ProtectedRoute', () => {
  it('redirects anonymous users to login', () => {
    renderGuard('/admin', ['admin']);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });
  it('sends a student away from admin routes', () => {
    authState.user = { role: 'student' };
    renderGuard('/admin', ['admin']);
    expect(screen.getByText('unauthorized page')).toBeInTheDocument();
  });
  it('lets an admin in', () => {
    authState.user = { role: 'admin' };
    renderGuard('/admin', ['admin']);
    expect(screen.getByText('admin area')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  const renderLogin = () =>
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/lecturer" element={<p>lecturer home</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it('validates required fields before calling sign-in', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(authState.signIn).not.toHaveBeenCalled();
  });

  it('shows the server error on failed sign-in', async () => {
    authState.signIn.mockRejectedValue(new Error('Invalid email or password.'));
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'lecturer@example.edu');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('navigates to the role home after sign-in', async () => {
    authState.signIn.mockResolvedValue({ role: 'lecturer' });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'lecturer@example.edu');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('lecturer home')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('confirms and closes on Escape', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open title="Delete?" message="Sure?" onConfirm={onConfirm} onClose={onClose} confirmLabel="Delete" />);
    expect(screen.getByRole('dialog', { name: 'Delete?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
