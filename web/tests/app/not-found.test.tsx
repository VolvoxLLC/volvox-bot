import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotFoundPage from '@/app/not-found';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('NotFoundPage', () => {
  it('renders a funny 404 state with recovery actions', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('main', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByText(/This channel does not exist/i)).toBeInTheDocument();
    expect(screen.getByText(/The bot checked/i)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Return home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Open dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('shows route diagnostics as stable page content', () => {
    render(<NotFoundPage />);

    expect(screen.getByText('ROUTE_PACKET')).toBeInTheDocument();
    expect(screen.getByText('NULL_DESTINATION')).toBeInTheDocument();
    expect(screen.getByText('BOT_CONFIDENCE')).toBeInTheDocument();
    expect(screen.getByText('ABSOLUTELY GUESSING')).toBeInTheDocument();
  });
});
