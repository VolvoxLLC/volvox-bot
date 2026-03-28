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
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  let nextHandle = 1;
  let lastTimestamp = 0;
  let cancelledHandles: Set<number>;

  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
    nextHandle = 1;
    lastTimestamp = 0;
    cancelledHandles = new Set();
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      queueMicrotask(() => { if (!cancelledHandles.has(handle)) { lastTimestamp += 2000; cb(lastTimestamp); } });
      return handle;
    });
    globalThis.cancelAnimationFrame = vi.fn((h: number) => { cancelledHandles.add(h); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it('should render 3 condensed stats after successful fetch', async () => {
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
      expect(screen.getByText('1.2M')).toBeInTheDocument(); // Members
      expect(screen.getByText('999')).toBeInTheDocument(); // Commands
      expect(screen.getByText('1d 3h')).toBeInTheDocument(); // Uptime
    });
    // Only 3 stats, not 6
    expect(screen.queryByText('5.5K')).not.toBeInTheDocument();
  });

  it('should render testimonial placeholders', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: 0, members: 0, commandsServed: 0,
        activeConversations: 0, uptime: 0, messagesProcessed: 0, cachedAt: '',
      }),
    } as Response);

    render(<Stats />);
    expect(screen.getByRole('heading', { name: /Loved by developers/i })).toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(3);
  });

  it('should render error fallback with 3 dashes', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    render(<Stats />);
    await waitFor(() => { expect(screen.getAllByText('—')).toHaveLength(3); });
  });
});
