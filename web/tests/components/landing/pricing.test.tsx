import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView, mockGetBotInviteUrl } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
  mockGetBotInviteUrl: vi.fn(),
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
      p: createComponent('p'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
  };
});

vi.mock('@/lib/discord', () => ({
  getBotInviteUrl: () => mockGetBotInviteUrl(),
}));

import { Pricing } from '@/components/landing/Pricing';

describe('Pricing', () => {
  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    mockGetBotInviteUrl.mockReturnValue('https://discord.com/invite/bot');
  });

  it('renders monthly pricing by default and switches to annual billing', async () => {
    const user = userEvent.setup();

    render(<Pricing />);

    expect(screen.getByRole('switch', { name: /toggle annual billing/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText('$14.99')).toBeInTheDocument();
    expect(screen.getAllByText('/mo')).toHaveLength(3);

    await user.click(screen.getByRole('switch', { name: /toggle annual billing/i }));

    expect(screen.getByRole('switch', { name: /toggle annual billing/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('$115')).toBeInTheDocument();
    expect(screen.getAllByText('/year')).toHaveLength(3);
    expect(screen.getByText('Save $64.88/year')).toBeInTheDocument();
    expect(screen.getByText('Save $129.88/year')).toBeInTheDocument();
  });

  it('uses github for the free tier and disables paid ctas when no invite url exists', () => {
    mockGetBotInviteUrl.mockReturnValue(null);

    render(<Pricing />);

    expect(screen.getByRole('link', { name: 'git clone' })).toHaveAttribute(
      'href',
      'https://github.com/VolvoxLLC/volvox-bot',
    );

    const installButtons = [screen.getByText('npm install'), screen.getByText('curl | bash')];
    for (const buttonLabel of installButtons) {
      const button = buttonLabel.closest('button');
      expect(button).not.toBeNull();
      expect(button).toBeDisabled();
    }
  });
});
