'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { BentoAIChat } from './bento/BentoAIChat';
import { BentoChart } from './bento/BentoChart';
import { BentoConversations } from './bento/BentoConversations';
import { BentoKpi } from './bento/BentoKpi';
import { BentoModeration } from './bento/BentoModeration';
import { ScrollStage } from './ScrollStage';
import { SectionHeader } from './SectionHeader';

interface AnimatedCellProps {
  children: ReactNode;
  isInView: boolean;
  shouldReduceMotion: boolean;
  delay?: number;
  className?: string;
}

/** Reusable animated wrapper for bento grid cells */
function AnimatedCell({
  children,
  isInView,
  shouldReduceMotion,
  delay = 0,
  className = '',
}: AnimatedCellProps) {
  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

import type { DailyActivityPoint } from './bento/bento-data';
export type { DailyActivityPoint };

// Re-use the same shape as Stats.tsx. TODO(#363): extract BotStats to shared types
interface BotStats {
  servers: number;
  members: number;
  commandsServed: number;
  activeConversations: number;
  uptime: number;
  messagesProcessed: number;
  dailyActivity?: DailyActivityPoint[];
  cachedAt: string;
}

/**
 * Landing page "THE PRODUCT" section.
 * Renders an animated bento grid showcasing dashboard capabilities
 * with live stats from /api/stats and randomized mock data.
 */
export function DashboardShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const shouldReduceMotion = useReducedMotion() ?? false;

  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats', { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BotStats = await res.json();
        if (!controller.signal.aborted) {
          setStats(data);
          setLoading(false);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError(true);
        }
      } finally {
        clearTimeout(timeout);
      }
    };
    fetchStats();
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  type NumericBotStats = Pick<
    BotStats,
    | 'servers'
    | 'members'
    | 'commandsServed'
    | 'activeConversations'
    | 'uptime'
    | 'messagesProcessed'
  >;
  const kpiValue = (field: keyof NumericBotStats): number | null => {
    if (error && !stats) return null;
    return (stats?.[field] as number) ?? null;
  };

  return (
    <section className="px-4 py-28 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-5xl" ref={containerRef}>
        <ScrollStage>
          <SectionHeader
            label="THE PRODUCT"
            labelColor="primary"
            title="Your server, at a glance"
            subtitle="A dashboard that makes you feel in control."
            className="mb-12"
          />

          {/* Bento grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Row 1-2: Chart (spans 2 rows on lg) */}
            <AnimatedCell
              className="sm:col-span-2 lg:col-span-1 lg:row-span-2"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0}
            >
              <BentoChart dailyActivity={stats?.dailyActivity} />
            </AnimatedCell>

            {/* Row 1: Members KPI */}
            <AnimatedCell
              className="h-full"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0.08}
            >
              <BentoKpi
                value={kpiValue('members')}
                label="Total Members"
                loading={loading}
                color="primary"
              />
            </AnimatedCell>

            {/* Row 1: Commands Served KPI */}
            <AnimatedCell
              className="h-full"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0.16}
            >
              <BentoKpi
                value={kpiValue('commandsServed')}
                label="Commands Served"
                loading={loading}
                color="secondary"
              />
            </AnimatedCell>

            {/* Row 2: Servers KPI */}
            <AnimatedCell
              className="h-full"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0.24}
            >
              <BentoKpi
                value={kpiValue('servers')}
                label="Servers"
                loading={loading}
                color="accent"
              />
            </AnimatedCell>

            {/* Row 2: Moderation */}
            <AnimatedCell
              className="h-full"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0.32}
            >
              <BentoModeration />
            </AnimatedCell>

            {/* Row 3: AI Chat (spans 2 cols) */}
            <AnimatedCell
              className="sm:col-span-2 h-full"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0.4}
            >
              <BentoAIChat />
            </AnimatedCell>

            {/* Row 3: Conversations */}
            <AnimatedCell
              className="h-full"
              isInView={isInView}
              shouldReduceMotion={shouldReduceMotion}
              delay={0.48}
            >
              <BentoConversations />
            </AnimatedCell>
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
