'use client';

import { AnimatedCounter, formatNumber } from '../AnimatedCounter';

interface BentoKpiProps {
  readonly value: number | null;
  readonly label: string;
  readonly loading: boolean;
  readonly color: 'primary' | 'secondary' | 'accent';
}

const colorMap = {
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary/15 text-secondary',
  accent: 'bg-accent/15 text-accent',
} as const;

/**
 * Reusable KPI cell for the bento grid.
 * Shows an animated counter with a label and live indicator badge.
 * @param value - The numeric value to display, or null when unavailable
 * @param label - Descriptive label shown beneath the value
 * @param loading - When true, renders a skeleton placeholder
 * @param color - Theme color for the live badge
 */
export function BentoKpi({ value, label, loading, color }: BentoKpiProps) {
  const badgeClass = colorMap[color];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5">
      {loading ? (
        <>
          <div className="h-8 w-20 animate-pulse rounded bg-muted mb-2" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        </>
      ) : value === null ? (
        <>
          <div className="text-2xl font-bold text-muted-foreground">—</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-foreground tracking-tight tabular-nums">
            <AnimatedCounter target={value} duration={1.2} formatter={formatNumber} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
          <div className="mt-2">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
              live
            </span>
          </div>
        </>
      )}
    </div>
  );
}
