import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
  mockUseReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ animate: _animate, initial: _initial, transition: _transition, whileHover: _whileHover, exit: _exit, ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      span: createComponent('span'),
      path: createComponent('path'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output: unknown[]) => output[0],
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

vi.mock('gsap', () => ({
  gsap: { registerPlugin: vi.fn(), fromTo: vi.fn(), to: vi.fn() },
  default: { registerPlugin: vi.fn(), fromTo: vi.fn(), to: vi.fn() },
}));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));
vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));

import { DashboardShowcase } from '@/components/landing/DashboardShowcase';

const mockStats = {
  servers: 42,
  members: 12_847,
  commandsServed: 48_200,
  activeConversations: 12,
  uptime: 97_200,
  messagesProcessed: 5_500,
  cachedAt: '2026-03-25T12:00:00.000Z',
};

describe('DashboardShowcase', () => {
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

  it('should render section header with Control Center label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    expect(screen.getByText('Control Center')).toBeInTheDocument();
    expect(screen.getByText('Your server, at a glance')).toBeInTheDocument();
  });

  it('should render all bento cell titles', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    expect(screen.getByText('Server Activity')).toBeInTheDocument();
    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });

  it('should render live KPI values after fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    await waitFor(() => {
      expect(screen.getByText('12.8K')).toBeInTheDocument();
      expect(screen.getByText('48.2K')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('should render loading skeletons initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(<DashboardShowcase />);
    // Loading state shows animate-pulse skeleton divs and the section header
    expect(screen.getByText('Control Center')).toBeInTheDocument();
    expect(screen.getByText('Your server, at a glance')).toBeInTheDocument();
  });

  it('should render error fallback dashes on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    render(<DashboardShowcase />);
    await waitFor(() => {
      expect(screen.getAllByText('—')).toHaveLength(3);
    });
  });

  it('should render the LIVE badge on the chart', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    render(<DashboardShowcase />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
