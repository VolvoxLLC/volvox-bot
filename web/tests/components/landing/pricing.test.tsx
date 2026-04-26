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
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Overclocked')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$14.99')).toBeInTheDocument();
    expect(screen.queryByText('Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Contact Sales')).not.toBeInTheDocument();
  });

  it('should switch to annual billing', async () => {
    const user = userEvent.setup();
    render(<Pricing />);
    await user.click(screen.getByRole('button', { name: /toggle annual billing/i }));
    expect(screen.getByText('$115')).toBeInTheDocument();
  });

  it('should render the system access tiers label', () => {
    render(<Pricing />);
    expect(screen.getByText('SYSTEM ACCESS TIERS')).toBeInTheDocument();
  });

  it('should link tiers to bot invite URL', () => {
    render(<Pricing />);
    const links = screen.getAllByRole('link', { name: /INITIALIZE|DEPLOY/i });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://discord.com/invite/bot');
    }
  });

  it('should render CTA text without links when no invite URL', () => {
    mockGetBotInviteUrl.mockReturnValue(null);
    render(<Pricing />);
    expect(screen.getByText('INITIALIZE STANDARD')).toBeInTheDocument();
    expect(screen.getByText('DEPLOY OVERCLOCKED')).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /INITIALIZE|DEPLOY/i })).toHaveLength(0);
  });
});
