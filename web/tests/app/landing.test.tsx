import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      path: createComponent('path'),
      span: createComponent('span'),
      section: createComponent('section'),
      tr: createComponent('tr'),
      td: createComponent('td'),
    },
    useInView: () => true,
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => false,
  };
});

import LandingPage from '@/app/page';

describe('LandingPage', () => {
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: 1,
        members: 1,
        commandsServed: 1,
        activeConversations: 0,
        uptime: 0,
        messagesProcessed: 0,
        cachedAt: '',
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalClientId !== undefined) {
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    } else {
      delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    }
  });

  it('renders the hero heading with volvox-bot', () => {
    render(<LandingPage />);
    const volvoxElements = screen.getAllByText(/Volvox/i);
    expect(volvoxElements.length).toBeGreaterThan(0);
  });

  it('renders feature cards', () => {
    render(<LandingPage />);
    expect(screen.getAllByText('AI Chat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Moderation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Starboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analytics').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('GitHub').length).toBeGreaterThan(0);
    expect(screen.getByText('Support Server')).toBeInTheDocument();
  });

  it('has CTA section', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { name: /Ready to upgrade/i })).toBeInTheDocument();
  });

  it('renders theme toggle', () => {
    render(<LandingPage />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('renders the product showcase section', () => {
    render(<LandingPage />);
    expect(screen.getByText('THE PRODUCT')).toBeInTheDocument();
  });
});
