import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { AnimatedCounter, formatNumber } from '../AnimatedCounter';

interface BentoKpiProps {
  readonly value: number | null;
  readonly label: string;
  readonly loading: boolean;
  readonly color: 'primary' | 'secondary' | 'accent';
  readonly icon: LucideIcon;
}

const colorMap = {
  primary: {
    badge: 'bg-primary/20 text-primary border-primary/20',
    glow: 'from-primary/20 to-transparent',
    icon: 'text-primary',
  },
  secondary: {
    badge: 'bg-secondary/20 text-secondary border-secondary/20',
    glow: 'from-secondary/20 to-transparent',
    icon: 'text-secondary',
  },
  accent: {
    badge: 'bg-accent/20 text-accent border-accent/20',
    glow: 'from-accent/20 to-transparent',
    icon: 'text-accent',
  },
} as const;

/**
 * Reusable KPI cell for the bento grid.
 * Shows an animated counter with a label and live indicator badge.
 */
export function BentoKpi({ value, label, loading, color, icon: Icon }: BentoKpiProps) {
  const theme = colorMap[color];
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldReduceMotion = mounted ? (reducedMotion ?? false) : (reducedMotion ?? true);

  return (
    <div className="group relative rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 overflow-hidden h-full flex flex-col">
      {/* Decorative Glow */}
      <div
        className={`absolute -bottom-10 -right-10 w-32 h-32 bg-gradient-to-br ${theme.glow} blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500`}
      />

      {loading ? (
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="h-8 w-20 animate-pulse rounded bg-muted mb-2" />
          <div className="mt-auto">
            <div className="w-16 h-3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div
              className={`p-2 rounded-xl bg-white/5 border border-white/5 ${theme.icon} shadow-inner`}
            >
              <Icon className="w-4 h-4" />
            </div>
            {!shouldReduceMotion && (
              <div className="flex gap-1 items-center">
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${theme.icon.replace(
                      'text',
                      'bg',
                    )}`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-1.5 w-1.5 ${theme.icon.replace(
                      'text',
                      'bg',
                    )}`}
                  />
                </span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${theme.icon}`}>
                  Live
                </span>
              </div>
            )}
          </div>

          <div className="text-3xl font-black text-foreground tracking-tighter tabular-nums mb-1">
            {value === null ? (
              '—'
            ) : shouldReduceMotion ? (
              formatNumber(value)
            ) : (
              <AnimatedCounter target={value} duration={1.5} formatter={formatNumber} />
            )}
          </div>

          <div className="mt-auto pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider">
              {label}
            </span>
            <div
              className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${theme.badge} shadow-sm`}
            >
              SYNCED
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
