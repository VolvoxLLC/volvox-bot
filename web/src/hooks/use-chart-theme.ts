'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Theme-aware color palette for recharts.
 *
 * Provides colors that are legible in both light and dark mode.
 * Discord purple is used as primary brand color, with accessible
 * accent colors for secondary series.
 */
export interface ChartTheme {
  /** Primary series color (Discord purple) */
  primary: string;
  /** Success / positive metric color */
  success: string;
  /** Warning / caution metric color */
  warning: string;
  /** Destructive / negative metric color */
  danger: string;
  /** Purple accent */
  purple: string;
  /** Cyan accent */
  cyan: string;
  /** Grid line color — subtle in both themes */
  grid: string;
  /** Tooltip background */
  tooltipBg: string;
  /** Tooltip border */
  tooltipBorder: string;
  /** Tooltip text */
  tooltipText: string;
  /** Fallback palette for pie/multi-series charts (5 colors) */
  palette: string[];
}

const LIGHT_THEME: ChartTheme = {
  primary: '#5865F2', // Discord blurple
  success: '#16A34A', // green-700 — visible on white
  warning: '#D97706', // amber-600
  danger: '#DC2626', // red-600
  purple: '#7C3AED', // violet-600
  cyan: '#0891B2', // cyan-600
  grid: '#E5E7EB', // gray-200
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E5E7EB',
  tooltipText: '#111827',
  palette: ['#5865F2', '#16A34A', '#D97706', '#7C3AED', '#0891B2'],
};

const DARK_THEME: ChartTheme = {
  primary: '#818CF8', // indigo-400 — visible on dark bg
  success: '#4ADE80', // green-400
  warning: '#FCD34D', // amber-300
  danger: '#F87171', // red-400
  purple: '#A78BFA', // violet-400
  cyan: '#22D3EE', // cyan-400
  grid: '#374151', // gray-700
  tooltipBg: '#1F2937',
  tooltipBorder: '#374151',
  tooltipText: '#F9FAFB',
  palette: ['#818CF8', '#4ADE80', '#FCD34D', '#A78BFA', '#22D3EE'],
};

/**
 * Returns a theme-aware color palette for use in recharts components.
 *
 * Handles hydration safely by deferring until after mount. Returns the
 * light theme on first render to avoid a flash of incorrect colors.
 *
 * @example
 * const chart = useChartTheme();
 * <Line stroke={chart.primary} />
 * <CartesianGrid stroke={chart.grid} />
 */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount (SSR / hydration): use light theme to match default
  if (!mounted) return LIGHT_THEME;

  return resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;
}
