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
    motion: {
      div: createComponent('div'),
      h2: createComponent('h2'),
      p: createComponent('p'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useReducedMotion: () => mockUseReducedMotion(),
  };
});

import { FeatureGrid } from '@/components/landing/FeatureGrid';

describe('FeatureGrid', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders every feature card with its terminal command', () => {
    render(<FeatureGrid />);

    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('Starboard')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(
      screen.getByText(/Mention @volvox to chat with Claude/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Built by developers who actually use Discord/i)).toBeInTheDocument();
  });

  it('still renders correctly when reduced motion is enabled', () => {
    mockUseReducedMotion.mockReturnValue(true);

    render(<FeatureGrid />);

    expect(screen.getByText(/Everything you need/i)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
  });
});
