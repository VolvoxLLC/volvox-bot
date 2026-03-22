import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetBotInviteUrl, mockUseReducedMotion } = vi.hoisted(() => ({
  mockGetBotInviteUrl: vi.fn(),
  mockUseReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ animate: _animate, initial: _initial, transition: _transition, whileHover: _whileHover, whileInView: _whileInView, viewport: _viewport, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      h1: createComponent('h1'),
      h2: createComponent('h2'),
      li: createComponent('li'),
      p: createComponent('p'),
      span: createComponent('span'),
      section: createComponent('section'),
    },
    useInView: () => true,
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

vi.mock('@/lib/discord', () => ({
  getBotInviteUrl: () => mockGetBotInviteUrl(),
}));

import { Footer } from '@/components/landing/Footer';

describe('Footer', () => {
  beforeEach(() => {
    mockGetBotInviteUrl.mockReturnValue('https://discord.com/invite/bot');
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('should render the CTA with Discord invite link', () => {
    render(<Footer />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Ready to upgrade/i);
    const cta = screen.getByRole('link', { name: /Add to Discord/i });
    expect(cta).toHaveAttribute('href', 'https://discord.com/invite/bot');
  });

  it('should render disabled CTA when no invite URL', () => {
    mockGetBotInviteUrl.mockReturnValue(null);
    render(<Footer />);
    expect(screen.getByText(/Coming Soon/i)).toBeInTheDocument();
  });

  it('should render footer links', () => {
    render(<Footer />);
    expect(screen.getByText('Documentation')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Support Server')).toBeInTheDocument();
  });

  it('should render the tagline and copyright', () => {
    render(<Footer />);
    expect(screen.getByText(/Open source. Self-hostable. Free forever./i)).toBeInTheDocument();
    expect(screen.getByText(/Volvox/i)).toBeInTheDocument();
  });
});
