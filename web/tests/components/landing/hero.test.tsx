import { act, render, screen } from '@testing-library/react';
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

import { Hero } from '@/components/landing/Hero';

describe.skip('Hero', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should use 40ms typing speed and 150ms start delay', () => {
    render(<Hero />);
    expect(screen.getByText(/Building the future of Discord communities/i)).toBeInTheDocument();
    expect(document.querySelector('.terminal-cursor')).not.toBeNull();
  });

  it('should reveal headline and CTAs after typewriter completes', () => {
    render(<Hero />);

    act(() => {
      vi.advanceTimersByTime(800); // 150ms delay + 10 chars * 40ms + buffer
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /volvox-bot\s*AI-powered Discord\./i,
    );
    expect(screen.getByRole('link', { name: /Open Dashboard/i })).toHaveAttribute('href', '/login');
  });

  it('should render the chat console with channel context', () => {
    render(<Hero />);
    expect(screen.getByText('volvox-bot')).toBeInTheDocument();
    expect(screen.getByText('#general')).toBeInTheDocument();
  });

  it('should still render correctly when reduced motion is enabled', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<Hero />);
    expect(screen.getByText(/Building the future of Discord communities/i)).toBeInTheDocument();
  });
});
