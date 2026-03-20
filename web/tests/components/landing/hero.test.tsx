import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
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
      p: createComponent('p'),
      span: createComponent('span'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
  };
});

import { Hero } from '@/components/landing/Hero';

describe('Hero', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseInView.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows the blinking cursor before the typewriter finishes', () => {
    render(<Hero />);

    expect(screen.getByText(/Building the future of Discord communities/i)).toBeInTheDocument();
    expect(document.querySelector('.terminal-cursor')).not.toBeNull();
  });

  it('reveals the typed headline and CTAs after the timer completes', async () => {
    render(<Hero />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /volvox-bot\s*AI-powered Discord\./i,
    );
    expect(
      screen.getByText(/A software-powered bot for modern communities/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Dashboard/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: /View on GitHub/i })).toHaveAttribute(
      'href',
      'https://github.com/VolvoxLLC/volvox-bot',
    );
    expect(document.querySelector('.terminal-cursor')).toBeNull();
  });
});
