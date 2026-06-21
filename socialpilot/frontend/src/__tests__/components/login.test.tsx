import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock api module
const mockPost = vi.fn();
const mockSetToken = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
    setToken: (...args: any[]) => mockSetToken(...args),
  },
}));

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set window.google to undefined for clean tests
    (window as any).google = undefined;
  });

  it('renders the login form with all required elements', async () => {
    const LoginPage = (await import('@/app/(auth)/login/page')).default;
    const { container } = render(<LoginPage />);

    // Check heading and subtitle
    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('Sign in to KluConnect')).toBeTruthy();

    // Check Google OAuth button
    expect(screen.getByText('Continue with Google')).toBeTruthy();

    // Check dividers (there are 2: between Demo+Google and Google+form)
    const orDividers = screen.getAllByText('OR');
    expect(orDividers.length).toBeGreaterThanOrEqual(1);

    // Check email and password fields
    expect(screen.getByPlaceholderText('you@company.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy();

    // Check submit button
    expect(screen.getByText('Sign in')).toBeTruthy();

    // Check register link
    expect(screen.getByText("Don't have an account?")).toBeTruthy();
    expect(screen.getByText('Create one')).toBeTruthy();
  });

  it('submits email and password and navigates to dashboard on success', async () => {
    mockPost.mockResolvedValueOnce({
      success: true,
      data: { user: { id: '1', email: 'test@test.com' }, token: 'fake-token' },
    });

    const LoginPage = (await import('@/app/(auth)/login/page')).default;
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('you@company.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByText('Sign in');

    await userEvent.type(emailInput, 'test@test.com');
    await userEvent.type(passwordInput, 'password123');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/auth/login', {
        email: 'test@test.com',
        password: 'password123',
      });
      expect(mockSetToken).toHaveBeenCalledWith('fake-token');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows error message on login failure', async () => {
    mockPost.mockResolvedValueOnce({
      success: false,
      error: 'Invalid credentials',
    });

    const LoginPage = (await import('@/app/(auth)/login/page')).default;
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('you@company.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByText('Sign in');

    await userEvent.type(emailInput, 'test@test.com');
    await userEvent.type(passwordInput, 'wrong');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeTruthy();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows loading state during form submission', async () => {
    // Don't resolve the promise yet
    mockPost.mockReturnValueOnce(new Promise(() => {}));

    const LoginPage = (await import('@/app/(auth)/login/page')).default;
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('you@company.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByText('Sign in');

    await userEvent.type(emailInput, 'test@test.com');
    await userEvent.type(passwordInput, 'password123');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeTruthy();
    });
  });

  it('disables submit button while loading', async () => {
    mockPost.mockReturnValueOnce(new Promise(() => {}));

    const LoginPage = (await import('@/app/(auth)/login/page')).default;
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText('you@company.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByText('Sign in');

    await userEvent.type(emailInput, 'test@test.com');
    await userEvent.type(passwordInput, 'password123');
    fireEvent.click(submitButton);

    await waitFor(() => {
      const loadingButton = screen.getByText('Signing in...');
      expect((loadingButton as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('shows Google loading state when Google button is clicked', async () => {
    const LoginPage = (await import('@/app/(auth)/login/page')).default;
    render(<LoginPage />);

    const googleButton = screen.getByText('Continue with Google');

    // Clicking will trigger google script load - it will error since Google isn't loaded
    fireEvent.click(googleButton);

    await waitFor(() => {
      // Should show connecting state at some point
      expect(screen.getByText('Connecting...')).toBeTruthy();
    });
  });
});
