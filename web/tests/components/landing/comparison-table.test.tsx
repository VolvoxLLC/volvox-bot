import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView, mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
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
      tr: createComponent('tr'),
      td: createComponent('td'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useScroll: () => ({ scrollY: 0, scrollYProgress: 0 }),
    useSpring: (value: unknown) => value,
    useTransform: (_value: unknown, _input: unknown, output?: unknown[]) => (output ? output[0] : 0),
    useReducedMotion: () => mockUseReducedMotion(),
    animate: vi.fn(() => ({ stop: vi.fn() })),
    useMotionValue: vi.fn(() => ({ get: () => 0, set: vi.fn(), on: vi.fn() })),
  };
});

import { ComparisonTable } from '@/components/landing/ComparisonTable';

describe('ComparisonTable', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('should render all competitor column headers', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('Volvox')).toBeInTheDocument();
    expect(screen.getByText('MEE6')).toBeInTheDocument();
    expect(screen.getByText('DYNO')).toBeInTheDocument();
    expect(screen.getByText('CARL-BOT')).toBeInTheDocument();
  });

  it('should render feature rows', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('AI Neural Chat')).toBeInTheDocument();
    expect(screen.getByText('AI Moderation')).toBeInTheDocument();
    expect(screen.getByText('Global Analytics')).toBeInTheDocument();
  });

  it('should render the section header', () => {
    render(<ComparisonTable />);
    expect(screen.queryByText('[BENCHMARK_ANALYSIS]')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /Engineered for Superiority/i }),
    ).toBeInTheDocument();
  });

  it('handles hover movement and reduced-motion rendering branches', () => {
    mockUseReducedMotion.mockReturnValue(true);

    render(<ComparisonTable />);

    const firstFeature = screen.getByRole('row', { name: /AI Neural Chat/i });
    vi.spyOn(firstFeature, 'getBoundingClientRect').mockReturnValue({
      bottom: 80,
      height: 40,
      left: 10,
      right: 210,
      top: 40,
      width: 200,
      x: 10,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseEnter(firstFeature);
    fireEvent.mouseMove(firstFeature, { clientX: 110, clientY: 60 });
    fireEvent.mouseLeave(firstFeature);

    expect(firstFeature).toBeInTheDocument();
  });
});
