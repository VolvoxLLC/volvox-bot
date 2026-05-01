import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUseTheme } = vi.hoisted(() => ({
  mockUseTheme: vi.fn(),
}));

const { mockSetContext, mockUseGuildSelection, mockUsePathname } = vi.hoisted(() => ({
  mockSetContext: vi.fn(),
  mockUseGuildSelection: vi.fn(),
  mockUsePathname: vi.fn(),
}));

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@sentry/nextjs', () => ({
  setContext: mockSetContext,
}));

vi.mock('@/hooks/use-guild-selection', () => ({
  useGuildSelection: () => mockUseGuildSelection(),
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

vi.mock('sonner', () => ({
  Toaster: ({ theme }: { theme: string }) => <div data-testid="toaster" data-theme={theme} />,
}));

import { Providers } from '@/components/providers';

describe('Providers', () => {
  beforeEach(() => {
    mockSetContext.mockClear();
    mockUseGuildSelection.mockReturnValue(null);
    mockUsePathname.mockReturnValue('/');
  });

  it('wraps children in SessionProvider', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });

    render(
      <Providers>
        <div data-testid="child">Hello</div>
      </Providers>,
    );
    const sessionProvider = screen.getByTestId('session-provider');
    const child = screen.getByTestId('child');

    expect(sessionProvider).toContainElement(child);
    expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme', 'dark');
  });

  it('falls back to the system theme when no resolved theme exists', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: undefined });

    render(
      <Providers>
        <div>Fallback</div>
      </Providers>,
    );

    expect(screen.getByTestId('toaster')).toHaveAttribute('data-theme', 'system');
  });

  it('sets Sentry route and guild context tags', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
    mockUsePathname.mockReturnValue('/dashboard/settings');
    mockUseGuildSelection.mockReturnValue('1234567890');

    render(
      <Providers>
        <div>Dashboard</div>
      </Providers>,
    );

    expect(mockSetContext).toHaveBeenCalledWith('routing', { route: '/dashboard/settings' });
    expect(mockSetContext).toHaveBeenCalledWith('guild', { id: '1234567890' });
  });
});
