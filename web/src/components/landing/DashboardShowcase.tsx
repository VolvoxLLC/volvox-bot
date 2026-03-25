'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ScrollStage } from './ScrollStage';
import { SectionHeader } from './SectionHeader';
import { BentoAIChat } from './bento/BentoAIChat';
import { BentoChart } from './bento/BentoChart';
import { BentoConversations } from './bento/BentoConversations';
import { BentoKpi } from './bento/BentoKpi';
import { BentoModeration } from './bento/BentoModeration';

// Re-use the same shape as Stats.tsx. TODO: extract to shared type if more consumers appear.
interface BotStats {
  servers: number;
  members: number;
  commandsServed: number;
  activeConversations: number;
  uptime: number;
  messagesProcessed: number;
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
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BotStats = await res.json();
        if (!cancelled) {
          setStats(data);
          setLoading(false);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const kpiValue = (field: keyof BotStats): number | null => {
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
            <motion.div
              className="sm:col-span-2 lg:col-span-1 lg:row-span-2"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0 }}
            >
              <BentoChart />
            </motion.div>

            {/* Row 1: Members KPI */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.08 }}
            >
              <BentoKpi
                value={kpiValue('members')}
                label="Total Members"
                loading={loading}
                color="primary"
              />
            </motion.div>

            {/* Row 1: Commands Served KPI */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.16 }}
            >
              <BentoKpi
                value={kpiValue('commandsServed')}
                label="Commands Served"
                loading={loading}
                color="secondary"
              />
            </motion.div>

            {/* Row 2: Servers KPI */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.24 }}
            >
              <BentoKpi
                value={kpiValue('servers')}
                label="Servers"
                loading={loading}
                color="accent"
              />
            </motion.div>

            {/* Row 2: Moderation */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.32 }}
            >
              <BentoModeration />
            </motion.div>

            {/* Row 3: AI Chat (spans 2 cols) */}
            <motion.div
              className="sm:col-span-2"
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.4 }}
            >
              <BentoAIChat />
            </motion.div>

            {/* Row 3: Conversations */}
            <motion.div
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, delay: shouldReduceMotion ? 0 : 0.48 }}
            >
              <BentoConversations />
            </motion.div>
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
