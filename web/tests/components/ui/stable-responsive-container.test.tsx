import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StableResponsiveContainer } from '@/components/ui/stable-responsive-container';

function FakeChart({ height, width }: { height: number; width: number }) {
  return (
    <div data-testid="fake-chart">
      {width}x{height}
    </div>
  );
}

describe('StableResponsiveContainer', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('renders immediately when ResizeObserver is unavailable', () => {
    // @ts-expect-error test-only override
    globalThis.ResizeObserver = undefined;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(180);

    render(
      <StableResponsiveContainer>
        <FakeChart height={0} width={0} />
      </StableResponsiveContainer>,
    );

    return waitFor(() => {
      expect(screen.getByTestId('fake-chart')).toBeInTheDocument();
      expect(screen.getByText('320x180')).toBeInTheDocument();
    });
  });

  it('waits for a measurable host before mounting the chart', () => {
    let measuredWidth = 0;
    let measuredHeight = 0;
    let resizeCallback: ResizeObserverCallback | null = null;

    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => measuredWidth);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => measuredHeight);

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}

      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    render(
      <StableResponsiveContainer fallback={<span>Waiting</span>}>
        <FakeChart height={0} width={0} />
      </StableResponsiveContainer>,
    );

    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('fake-chart')).not.toBeInTheDocument();

    act(() => {
      measuredWidth = 320;
      measuredHeight = 180;
      resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
    });

    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    expect(screen.getByTestId('fake-chart')).toBeInTheDocument();
    expect(screen.getByText('320x180')).toBeInTheDocument();
  });
});
