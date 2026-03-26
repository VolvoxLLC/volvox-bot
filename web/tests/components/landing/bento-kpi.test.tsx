import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseInView } = vi.hoisted(() => ({
  mockUseInView: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const createComponent = (tag: string) =>
    React.forwardRef(({ ...props }: any, ref: any) =>
      React.createElement(tag, { ...props, ref }, props.children)
    );
  return {
    motion: { div: createComponent('div'), span: createComponent('span') },
    useInView: (...args: unknown[]) => mockUseInView(...args),
    useReducedMotion: () => false,
  };
});

import { BentoKpi } from '@/components/landing/bento/BentoKpi';

describe('BentoKpi', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;
  let nextHandle = 1;
  let lastTimestamp = 0;
  let cancelledHandles: Set<number>;

  beforeEach(() => {
    mockUseInView.mockReturnValue(true);
    nextHandle = 1;
    lastTimestamp = 0;
    cancelledHandles = new Set();
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      queueMicrotask(() => { if (!cancelledHandles.has(handle)) { lastTimestamp += 2000; cb(lastTimestamp); } });
      return handle;
    });
    globalThis.cancelAnimationFrame = vi.fn((h: number) => { cancelledHandles.add(h); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it('should render loading skeleton when loading', () => {
    const { container } = render(<BentoKpi value={null} label="Members" loading={true} color="primary" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('should render dash on error (value=null, not loading)', () => {
    render(<BentoKpi value={null} label="Members" loading={false} color="primary" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('should render formatted value and label on success', async () => {
    render(<BentoKpi value={1247} label="Members" loading={false} color="primary" />);
    await waitFor(() => {
      expect(screen.getByText('1.2K')).toBeInTheDocument();
    });
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('live')).toBeInTheDocument();
  });
});
