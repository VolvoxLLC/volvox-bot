import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(screen.getByText('Dyno')).toBeInTheDocument();
    expect(screen.getByText('Carl-bot')).toBeInTheDocument();
  });

  it('should render all 8 feature rows', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('AI Moderation')).toBeInTheDocument();
    expect(screen.getByText('Open Source')).toBeInTheDocument();
    expect(screen.getByText('Self-Hostable')).toBeInTheDocument();
    expect(screen.getByText('Web Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Starboard')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Free Tier')).toBeInTheDocument();
  });

  it('should render the section header', () => {
    render(<ComparisonTable />);
    expect(screen.getByText('WHY VOLVOX')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Compare the alternatives');
  });
});
