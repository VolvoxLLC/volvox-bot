import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView, mockUseReducedMotion, mockGetBotInviteUrl } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
  mockUseReducedMotion: vi.fn(),
  mockGetBotInviteUrl: vi.fn(),
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

vi.mock('@/lib/discord', () => ({
  getBotInviteUrl: () => mockGetBotInviteUrl(),
}));

import { Pricing } from '@/components/landing/Pricing';

describe('Pricing', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockUseReducedMotion.mockReturnValue(false);
    mockGetBotInviteUrl.mockReturnValue('https://discord.com/invite/bot');
  });

  it('should render 2 tiers with monthly pricing by default', () => {
    render(<Pricing />);
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$14.99')).toBeInTheDocument();
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact Sales')).not.toBeInTheDocument();
  });

  it('should switch to annual billing', async () => {
    const user = userEvent.setup();
    render(<Pricing />);
    await user.click(screen.getByRole('switch', { name: /toggle annual billing/i }));
    expect(screen.getByText('$115')).toBeInTheDocument();
    expect(screen.getByText('Save $64.88/year')).toBeInTheDocument();
  });

  it('should use SectionHeader with PRICING label', () => {
    render(<Pricing />);
    expect(screen.getByText('PRICING')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Simple, transparent pricing');
  });

  it('should link free tier to bot invite URL when no custom href', () => {
    render(<Pricing />);
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      'https://discord.com/invite/bot',
    );
  });

  it('should disable pro CTA when no invite URL', () => {
    mockGetBotInviteUrl.mockReturnValue(null);
    render(<Pricing />);
    const button = screen.getByText('Start Free Trial').closest('button');
    expect(button).toBeDisabled();
  });
});
