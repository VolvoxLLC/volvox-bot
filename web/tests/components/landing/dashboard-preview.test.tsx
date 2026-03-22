import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import { DashboardPreview } from '@/components/landing/DashboardPreview';

describe('DashboardPreview', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('should render the Overview tab by default', () => {
    render(<DashboardPreview />);
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Messages Today')).toBeInTheDocument();
    expect(screen.getByText('Server Activity')).toBeInTheDocument();
  });

  it('should switch to Moderation tab when clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    await user.click(screen.getByRole('button', { name: /Moderation/i }));
    expect(screen.getByText(/Threats Blocked/i)).toBeInTheDocument();
  });

  it('should switch to AI Chat tab when clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    await user.click(screen.getByRole('button', { name: /AI Chat/i }));
    expect(screen.getByText(/Conversations/i)).toBeInTheDocument();
  });

  it('should switch to Settings tab when clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    await user.click(screen.getByRole('button', { name: /Settings/i }));
    // "AI Chat" appears both as a tab button and as a settings toggle label
    const aiChatMatches = screen.getAllByText(/AI Chat/i);
    expect(aiChatMatches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Starboard/i)).toBeInTheDocument();
  });

  it('should render all 4 tab buttons', () => {
    render(<DashboardPreview />);
    expect(screen.getByRole('button', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Moderation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI Chat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
  });

  it('should render tabs with keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<DashboardPreview />);
    const overviewTab = screen.getByRole('button', { name: /Overview/i });
    overviewTab.focus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: /Moderation/i })).toHaveFocus();
  });
});
