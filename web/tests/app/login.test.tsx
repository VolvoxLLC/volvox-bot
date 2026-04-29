import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  push: vi.fn(),
  session: { data: null as unknown, status: 'unauthenticated' },
  searchParams: new URLSearchParams(),
  reducedMotion: false,
}));

vi.mock('next-auth/react', () => ({
  useSession: () => mocks.session,
  signIn: (...args: unknown[]) => mocks.signIn(...args),
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next/image', () => ({
  default: ({ alt, className, src }: { alt: string; className?: string; src: string }) => (
    <img alt={alt} className={className} src={src} />
  ),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const MotionDiv = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    ),
  );
  MotionDiv.displayName = 'MotionDiv';

  return {
    motion: { div: MotionDiv },
    useReducedMotion: () => mocks.reducedMotion,
  };
});

vi.mock('@/components/landing/Hero', () => ({
  PrismaticBackground: () => <div data-testid="prismatic-background" />,
}));

vi.mock('@/components/layout/site-footer', () => ({
  SiteFooter: () => <footer>Footer</footer>,
}));

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}));

import LoginPage from '@/app/login/page';

function setSession(data: unknown, status = 'authenticated') {
  mocks.session = { data, status };
}

function renderLogin() {
  render(<LoginPage />);
}

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams();
    mocks.signIn.mockClear();
    mocks.signOut.mockClear();
    mocks.push.mockClear();
    mocks.session = { data: null, status: 'unauthenticated' };
    mocks.reducedMotion = false;
  });

  it('renders the login form and default callbackUrl /dashboard', async () => {
    const user = userEvent.setup();

    renderLogin();

    expect(
      screen.getByText(
        'Welcome back. Authorize your Discord account to assume control of your community intelligence.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sign in with discord/i }));

    expect(mocks.signIn).toHaveBeenCalledWith('discord', {
      callbackUrl: '/dashboard',
    });
  });

  it('uses a valid relative callbackUrl for sign in', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('callbackUrl=/servers/123?tab=moderation');

    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in with discord/i }));

    expect(mocks.signIn).toHaveBeenCalledWith('discord', {
      callbackUrl: '/servers/123?tab=moderation',
    });
  });

  it('falls back to /dashboard for an unsafe protocol-relative callbackUrl', async () => {
    const user = userEvent.setup();
    mocks.searchParams = new URLSearchParams('callbackUrl=//evil.com');

    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in with discord/i }));

    expect(mocks.signIn).toHaveBeenCalledWith('discord', {
      callbackUrl: '/dashboard',
    });
  });

  it('redirects authenticated users to the sanitized callbackUrl', async () => {
    mocks.searchParams = new URLSearchParams('callbackUrl=/servers/123');
    setSession({ user: { name: 'Test', email: 'test@test.com' } });

    renderLogin();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/servers/123');
    });
    expect(screen.getByText('Syncing')).toBeInTheDocument();
    expect(screen.queryByText(/Authorize your Discord account/i)).not.toBeInTheDocument();
  });

  it('sanitizes authenticated redirects and rejects protocol-relative callbackUrl values', async () => {
    mocks.searchParams = new URLSearchParams('callbackUrl=//evil.com');
    setSession({ user: { name: 'Test' } });

    renderLogin();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('keeps the login form visible without redirecting or signing out on RefreshTokenError', () => {
    setSession({ user: { name: 'Test' }, error: 'RefreshTokenError' });

    renderLogin();

    expect(screen.getByRole('button', { name: /sign in with discord/i })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('Syncing')).not.toBeInTheDocument();
  });

  it('shows the loading spinner while session state is loading', () => {
    mocks.session = { data: null, status: 'loading' };

    renderLogin();

    expect(screen.getByText('Syncing')).toBeInTheDocument();
    expect(screen.getByAltText('Loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with discord/i })).not.toBeInTheDocument();
  });

  it('renders the reduced-motion login path', () => {
    mocks.reducedMotion = true;

    renderLogin();

    expect(screen.getByRole('button', { name: /sign in with discord/i })).toBeInTheDocument();
    expect(screen.getAllByText('Active Sentry').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Neural Ops').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Global Edge').length).toBeGreaterThan(0);
  });
});
