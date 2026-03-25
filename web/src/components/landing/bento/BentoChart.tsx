'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useMemo, useRef } from 'react';
import { generateChartHeights } from './bento-data';

/**
 * SVG area chart cell for the bento grid.
 * Generates random heights on mount, draws path left-to-right on scroll-in,
 * and displays a pulsing "LIVE" indicator.
 */
export function BentoChart() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;

  const heights = useMemo(() => generateChartHeights(), []);

  const points = useMemo(() => {
    const width = 220;
    const height = 80;
    const padding = 5;
    const usableHeight = height - padding * 2;
    return heights.map((h, i) => ({
      x: (i / (heights.length - 1)) * width,
      y: padding + usableHeight * (1 - (h - 30) / 65),
    }));
  }, [heights]);

  const linePath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    return `${linePath} L220,80 L0,80 Z`;
  }, [linePath]);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 row-span-2"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Server Activity</span>
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-primary"
            animate={shouldReduceMotion ? {} : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-[10px] font-medium text-primary">LIVE</span>
        </div>
      </div>

      <svg viewBox="0 0 220 80" className="w-full h-auto mb-3" aria-label="Server activity chart">
        <defs>
          <linearGradient id="bento-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaPath}
          fill="url(#bento-area-fill)"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, delay: 0.3 }}
        />
        <motion.path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={shouldReduceMotion ? {} : { pathLength: 0 }}
          animate={isInView ? { pathLength: 1 } : {}}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        {isInView && (
          <circle
            cx={points[points.length - 1]?.x ?? 220}
            cy={points[points.length - 1]?.y ?? 10}
            r="3"
            fill="hsl(var(--primary))"
          />
        )}
      </svg>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Messages
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          AI Responses
        </span>
      </div>
    </div>
  );
}
