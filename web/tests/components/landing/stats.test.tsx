import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
  mockUseReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ animate: _animate, initial: _initial, transition: _transition, whileHover: _whileHover, ...props }: any, ref: any) =>
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
      path: createComponent('path'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

import { Stats } from '@/components/landing/Stats';

describe('Stats', () => {
  beforeEach(() => {
    // Always return false so AnimatedCounter's requestAnimationFrame loop never starts.
    // This avoids OOM/stack-overflow in test environments.
    mockUseInView.mockReturnValue(false);
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render 3 stat cards after successful fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: 1_234,
        members: 1_200_000,
        commandsServed: 999,
        activeConversations: 12,
        uptime: 97_200,
        messagesProcessed: 5_500,
        cachedAt: '2026-03-11T12:34:56.000Z',
      }),
    } as Response);

    render(<Stats />);

    await waitFor(() => {
      expect(screen.getByText('Global Intelligence')).toBeInTheDocument();
      expect(screen.getByText('Operational Flow')).toBeInTheDocument();
      expect(screen.getByText('System Stability')).toBeInTheDocument();
    });
  });

  it('should render testimonial quotes', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: 0, members: 0, commandsServed: 0,
        activeConversations: 0, uptime: 0, messagesProcessed: 0, cachedAt: '',
      }),
    } as Response);

    render(<Stats />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Alex Rivers/i)).toBeInTheDocument();
    expect(screen.getByText(/Sarah Chen/i)).toBeInTheDocument();
    expect(screen.getByText(/Marcus Wright/i)).toBeInTheDocument();
  });

  it('should render fallback values when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    render(<Stats />);
    // After fetch failure, component shows hardcoded fallback values (not dashes)
    await waitFor(() => {
      expect(screen.getByText('Global Intelligence')).toBeInTheDocument();
      expect(screen.getByText('Operational Flow')).toBeInTheDocument();
    });
  });
});
