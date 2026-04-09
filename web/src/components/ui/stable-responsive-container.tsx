'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type ChartSize = {
  height: number;
  width: number;
};

type StableResponsiveContainerProps = {
  children: React.ReactNode;
  className?: string;
  fallback?: React.ReactNode;
};

/**
 * Prevents Recharts from mounting into zero-sized boxes during initial layout.
 * This avoids the noisy width/height -1 warnings emitted by ResponsiveContainer.
 */
export function StableResponsiveContainer({
  children,
  className,
  fallback = null,
}: StableResponsiveContainerProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const animationFrameIdRef = React.useRef<number | null>(null);
  const [chartSize, setChartSize] = React.useState<ChartSize | null>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const updateSize = () => {
      const nextWidth = host.clientWidth;
      const nextHeight = host.clientHeight;

      if (nextWidth <= 0 || nextHeight <= 0) {
        setChartSize((currentSize) => (currentSize === null ? currentSize : null));
        return;
      }

      setChartSize((currentSize) => {
        if (currentSize?.width === nextWidth && currentSize.height === nextHeight) {
          return currentSize;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }

      animationFrameIdRef.current = requestAnimationFrame(() => {
        animationFrameIdRef.current = null;
        updateSize();
      });
    });

    observer.observe(host);

    return () => {
      observer.disconnect();
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={hostRef} className={cn('h-full w-full min-h-0 min-w-0', className)}>
      {chartSize
        ? React.isValidElement<Partial<ChartSize>>(children)
          ? React.cloneElement(children, {
              height: chartSize.height,
              width: chartSize.width,
            })
          : children
        : fallback}
    </div>
  );
}
