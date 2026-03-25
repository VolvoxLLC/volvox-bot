'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { DailyActivityPoint } from '../DashboardShowcase';
import { generateChartHeights } from './bento-data';

interface BentoChartProps {
  readonly dailyActivity?: DailyActivityPoint[];
}

/**
 * SVG area chart cell for the bento grid.
 * Uses real daily activity data when available, falls back to random heights.
 * Draws path left-to-right on scroll-in and displays a pulsing "LIVE" indicator.
 * Shows a tooltip with values on hover over data points.
 */
export function BentoChart({ dailyActivity }: BentoChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const fallbackHeights = useMemo(() => generateChartHeights(), []);

  const hasRealData = dailyActivity && dailyActivity.length > 0;

  // Convert real data or fallback to normalized heights (30-95 range)
  // Pad single data points to 7 so the chart always renders a full line
  const heights = useMemo(() => {
    if (!hasRealData) return fallbackHeights;

    const values = dailyActivity.map((d) => d.messages);
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    const range = max - min || 1;
    const normalized = values.map((v) => 30 + ((v - min) / range) * 65);

    // If fewer than 2 points, pad with the same height so the line is visible
    if (normalized.length === 1) {
      return [normalized[0], normalized[0]];
    }
    return normalized;
  }, [dailyActivity, hasRealData, fallbackHeights]);

  const points = useMemo(() => {
    const width = 220;
    const height = 140;
    const padding = 5;
    const usableHeight = height - padding * 2;
    const divisor = heights.length > 1 ? heights.length - 1 : 1;
    return heights.map((h, i) => ({
      x: (i / divisor) * width,
      y: padding + usableHeight * (1 - (h - 30) / 65),
    }));
  }, [heights]);

  const linePath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    return `${linePath} L220,140 L0,140 Z`;
  }, [linePath]);

  // Day labels from real data
  const dayLabels = useMemo(() => {
    if (!hasRealData) return null;
    return dailyActivity.map((d) => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    });
  }, [dailyActivity, hasRealData]);

  // Tooltip content for hovered point
  const tooltipData = useMemo(() => {
    if (hoveredIndex === null) return null;
    const point = points[hoveredIndex];
    if (!point) return null;

    if (hasRealData) {
      const d = dailyActivity[hoveredIndex];
      const date = new Date(d.date);
      const label = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      return { x: point.x, y: point.y, label, messages: d.messages, aiRequests: d.aiRequests };
    }
    return null;
  }, [hoveredIndex, points, dailyActivity, hasRealData]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!hasRealData) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 220;

      // Find closest point
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      setHoveredIndex(closestIdx);
    },
    [hasRealData, points],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

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

      <div className="relative">
        <svg
          viewBox="0 0 220 140"
          className="w-full h-auto mb-3"
          aria-label="Server activity chart"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
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
          {/* Default end dot (hidden when hovering) */}
          {isInView && hoveredIndex === null && (
            <circle
              cx={points[points.length - 1]?.x ?? 220}
              cy={points[points.length - 1]?.y ?? 10}
              r="3"
              fill="hsl(var(--primary))"
            />
          )}
          {/* Hover indicator line + dot */}
          {hoveredIndex !== null && points[hoveredIndex] && (
            <>
              <line
                x1={points[hoveredIndex].x}
                y1={0}
                x2={points[hoveredIndex].x}
                y2={140}
                stroke="hsl(var(--primary))"
                strokeOpacity="0.2"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={points[hoveredIndex].x}
                cy={points[hoveredIndex].y}
                r="4"
                fill="hsl(var(--primary))"
                stroke="hsl(var(--card))"
                strokeWidth="2"
              />
            </>
          )}
          {/* Invisible hit areas for each data point */}
          {hasRealData &&
            points.map((p, i) => (
              <rect
                key={`hit-${i}`}
                x={p.x - 220 / points.length / 2}
                y={0}
                width={220 / points.length}
                height={140}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                style={{ cursor: 'pointer' }}
              />
            ))}
        </svg>

        {/* Tooltip */}
        {tooltipData && (
          <div
            className="absolute pointer-events-none z-10 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-lg text-[10px]"
            style={{
              left: `${(tooltipData.x / 220) * 100}%`,
              top: `${(tooltipData.y / 140) * 100}%`,
              transform: `translate(${tooltipData.x > 160 ? '-100%' : tooltipData.x < 60 ? '0%' : '-50%'}, -120%)`,
            }}
          >
            <div className="font-medium text-foreground mb-0.5">{tooltipData.label}</div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1 align-middle" />
                {tooltipData.messages.toLocaleString()} messages
              </span>
              <span className="text-muted-foreground">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-secondary mr-1 align-middle" />
                {tooltipData.aiRequests.toLocaleString()} AI
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Day labels when real data is available */}
      {dayLabels && (
        <div className="flex justify-between text-[9px] text-muted-foreground mb-2 px-0.5">
          {dayLabels.map((label, i) => (
            <span key={`${label}-${i}`}>{label}</span>
          ))}
        </div>
      )}

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Messages
          {hasRealData &&
            ` (${dailyActivity.reduce((sum, d) => sum + d.messages, 0).toLocaleString()})`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          AI Responses
          {hasRealData &&
            ` (${dailyActivity.reduce((sum, d) => sum + d.aiRequests, 0).toLocaleString()})`}
        </span>
      </div>
    </div>
  );
}
