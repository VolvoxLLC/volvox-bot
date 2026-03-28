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

import { AnimatedCounter } from '@/components/landing/AnimatedCounter';

describe('AnimatedCounter', () => {
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

  it('should render the formatted target value after animation completes', async () => {
    render(<AnimatedCounter target={1234} />);
    await waitFor(() => { expect(screen.getByText('1.2K')).toBeInTheDocument(); });
  });

  it('should accept a custom formatter', async () => {
    const fmt = (n: number) => `${n}s`;
    render(<AnimatedCounter target={42} formatter={fmt} />);
    await waitFor(() => { expect(screen.getByText('42s')).toBeInTheDocument(); });
  });
});
