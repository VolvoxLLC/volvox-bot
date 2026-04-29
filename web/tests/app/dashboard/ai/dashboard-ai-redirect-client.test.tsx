import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(
      (
        {
          animate: _animate,
          exit: _exit,
          initial: _initial,
          transition: _transition,
          whileHover: _whileHover,
          whileTap: _whileTap,
          ...props
        }: Record<string, unknown> & { children?: React.ReactNode },
        ref,
      ) => React.createElement(tag, { ...props, ref }, props.children),
    );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: createComponent('div'),
      span: createComponent('span'),
    },
  };
});

import DashboardAiRedirectClient from '@/app/dashboard/ai/dashboard-ai-redirect-client';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardAiRedirectClient', () => {
  it('renders the AI redirect countdown and supports manual navigation', async () => {
    render(<DashboardAiRedirectClient />);

    expect(screen.getByRole('heading', { name: /coming soon/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /skip countdown/i }));

    expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations');
  });

  it('auto-redirects the AI page after the countdown reaches zero', async () => {
    vi.useFakeTimers();
    try {
      render(<DashboardAiRedirectClient />);
      for (let seconds = 0; seconds < 4; seconds += 1) {
        await act(async () => {
          vi.advanceTimersByTime(1_000);
        });
      }
      await act(async () => {
        vi.advanceTimersByTime(999);
      });
      expect(mockPush).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/dashboard/conversations');
    } finally {
      vi.useRealTimers();
    }
  });
});
