import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from '@/app/page';

// Mock Framer Motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <h2 {...props}>{children}</h2>
    ),
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...props}>{children}</p>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  useInView: () => true,
}));

describe('LandingPage', () => {
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  afterEach(() => {
    // Restore env var to prevent pollution between tests
    if (originalClientId !== undefined) {
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    } else {
      delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    }
  });

  it('renders the hero heading with volvox-bot', () => {
    render(<LandingPage />);
    // The typewriter effect renders "volvox-bot" after the ">" prompt
    // Check that the brand name appears somewhere in the document
    const volvoxElements = screen.getAllByText(/volvox-bot/);
    expect(volvoxElements.length).toBeGreaterThan(0);
  });

  it('renders feature cards', () => {
    render(<LandingPage />);
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('Starboard')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    render(<LandingPage />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('hides Add to Server button when CLIENT_ID is not set', () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    render(<LandingPage />);
    expect(screen.queryByText('Add to Server')).not.toBeInTheDocument();
  });

  it('shows Add to Server buttons when CLIENT_ID is set', () => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'test-client-id';
    render(<LandingPage />);
    expect(screen.getAllByText('Add to Server').length).toBeGreaterThan(0);
  });

  it('renders footer with links', () => {
    render(<LandingPage />);
    // GitHub appears in both header nav and footer
    expect(screen.getAllByText('GitHub').length).toBeGreaterThan(0);
    expect(screen.getByText('Support Server')).toBeInTheDocument();
  });

  it('has CTA section', () => {
    render(<LandingPage />);
    expect(screen.getByText(/Ready to upgrade your server/)).toBeInTheDocument();
  });

  it('renders theme toggle', () => {
    render(<LandingPage />);
    // Theme toggle button is present
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });
});
