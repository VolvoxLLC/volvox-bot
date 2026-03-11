import { render, screen, waitFor } from '@testing-library/react';
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
    motion: {
      div: createComponent('div'),
      h2: createComponent('h2'),
      p: createComponent('p'),
      span: createComponent('span'),
    },
    useInView: (...args: unknown[]) => mockUseInView(...args),
  };
});

import { Stats } from '@/components/landing/Stats';

describe('Stats', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let timestamp = 0;

  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    timestamp = 0;
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      return window.setTimeout(() => {
        timestamp += 2_000;
        callback(timestamp);
      }, 0);
    });
    globalThis.cancelAnimationFrame = vi.fn((handle: number) => clearTimeout(handle));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('renders formatted live stats after a successful fetch', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: 1_234,
        members: 1_200_000,
        commandsServed: 999,
        activeConversations: 12,
        uptime: 97_200,
        messagesProcessed: 5_500,
        cachedAt: '2026-03-11T12:34:56.000Z',
      }),
    } as Response);

    render(<Stats />);

    await waitFor(() => {
      expect(screen.getByText('1.2K')).toBeInTheDocument();
      expect(screen.getByText('1.2M')).toBeInTheDocument();
      expect(screen.getByText('999')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('1d 3h')).toBeInTheDocument();
      expect(screen.getByText('5.5K')).toBeInTheDocument();
    });
    expect(screen.getByText(/as of/i)).toBeInTheDocument();
    expect(screen.getByText('Loved by developers')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/stats');
  });

  it('renders the error fallback when fetching stats fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));

    render(<Stats />);

    await waitFor(() => {
      expect(screen.getAllByText('—')).toHaveLength(6);
    });
    expect(screen.getByText('Trusted by teams at leading tech companies and thousands of open-source communities')).toBeInTheDocument();
  });
});
