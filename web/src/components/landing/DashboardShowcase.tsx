'use client';

import { useEffect, useRef, useState } from 'react';
import { Globe, Terminal, Users, Monitor } from 'lucide-react';
import { BentoAIChat } from './bento/BentoAIChat';
import { BentoChart } from './bento/BentoChart';
import { BentoConversations } from './bento/BentoConversations';
import { BentoKpi } from './bento/BentoKpi';
import { BentoModeration } from './bento/BentoModeration';
import { SectionHeader } from './SectionHeader';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

import type { DailyActivityPoint } from './bento/bento-data';
export type { DailyActivityPoint } from './bento/bento-data';

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
 * A floating dashboard window mockup with live data cards arranged inside.
 */
export function DashboardShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
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
      } catch (err) {
        const isAbortError = err instanceof Error && err.name === 'AbortError';
        const isTimeoutAbort = isAbortError && controller.signal.aborted;
        if (!isTimeoutAbort) {
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

  useGSAP(
    () => {
      // Header entrance
      gsap.fromTo(
        '.ds-header',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 80%',
            toggleActions: 'play reverse play reverse',
          },
        },
      );

      // The entire dashboard window rises up with perspective
      gsap.fromTo(
        '.ds-window',
        { y: 120, opacity: 0, rotateX: 8, scale: 0.92 },
        {
          y: 0,
          opacity: 1,
          rotateX: 0,
          scale: 1,
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.ds-window',
            start: 'top 90%',
            toggleActions: 'play reverse play reverse',
          },
        },
      );

      // KPI strip slides in from the right
      gsap.fromTo(
        '.ds-kpi-strip',
        { x: 60, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.ds-kpi-strip',
            start: 'top 90%',
            toggleActions: 'play reverse play reverse',
          },
        },
      );

      // Gentle parallax on scroll past
      gsap.to('.ds-window', {
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
        y: -50,
      });
    },
    { scope: sectionRef },
  );

  type NumericBotStats = Pick<
    BotStats,
    'servers' | 'members' | 'commandsServed' | 'activeConversations' | 'uptime' | 'messagesProcessed'
  >;
  const kpiValue = (field: keyof NumericBotStats): number | null =>
    error && !stats ? null : (stats?.[field] as number) ?? null;

  return (
    <section
      ref={sectionRef}
      className="px-4 py-32 sm:px-6 lg:px-8 bg-background overflow-hidden relative"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[60vh] bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent blur-[160px] pointer-events-none" />

      <div className="mx-auto max-w-7xl relative z-10">
        {/* Section Header */}
        <div className="ds-header mb-20">
          <SectionHeader
            label="THE PRODUCT"
            labelColor="primary"
            title="Your server, at a glance"
            subtitle="Absolute control over your community, engineered for scale and speed."
          />
        </div>

        {/* ─── Floating Dashboard Window ─── */}
        <div className="ds-window perspective-1000 preserve-3d">
          {/* Main Dashboard Container */}
          <div className="glass-morphism-premium rounded-3xl overflow-hidden relative group">
            <div className="glass-reflection group-hover:translate-x-full transition-transform duration-1000 ease-in-out opacity-20" />

            {/* Title Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/40 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-accent/60" />
                  <div className="w-3 h-3 rounded-full bg-primary/60" />
                </div>
              </div>
              <div className="flex items-center gap-2 px-6 py-1.5 rounded-xl bg-background/50 border border-border/50 shadow-inner">
                <Monitor className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-[11px] text-muted-foreground/50 font-mono font-medium tracking-tight">
                  dashboard.volvox.bot
                </span>
              </div>
              <div className="w-16 hidden sm:block" /> {/* Spacer for symmetry */}
            </div>

            {/* Dashboard Content */}
            <div className="p-4 md:p-8 space-y-4">
              {/* KPI Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="ds-kpi-strip">
                  <BentoKpi
                    value={kpiValue('members')}
                    label="Total Members"
                    loading={loading}
                    color="primary"
                    icon={Users}
                  />
                </div>
                <div className="ds-kpi-strip">
                  <BentoKpi
                    value={kpiValue('commandsServed')}
                    label="Commands Served"
                    loading={loading}
                    color="secondary"
                    icon={Terminal}
                  />
                </div>
                <div className="ds-kpi-strip col-span-1 sm:col-span-2 lg:col-span-1">
                  <BentoKpi
                    value={kpiValue('servers')}
                    label="Servers"
                    loading={loading}
                    color="accent"
                    icon={Globe}
                  />
                </div>
              </div>

              {/* Main Content: Chart + Side Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Chart (spans 3) */}
                <div className="lg:col-span-3 min-h-[320px]">
                  <BentoChart dailyActivity={stats?.dailyActivity} />
                </div>

                {/* Side stack (spans 2) */}
                <div className="lg:col-span-2 grid grid-cols-1 gap-4">
                  <BentoModeration />
                  <BentoConversations />
                </div>
              </div>

              {/* Bottom: AI Chat full width */}
              <div className="w-full">
                <BentoAIChat />
              </div>
            </div>
          </div>

          {/* Realistic shadow & reflection */}
          <div className="mx-12 h-20 bg-gradient-to-b from-foreground/[0.03] to-transparent rounded-b-[4rem] blur-2xl -mt-6 pointer-events-none" />
        </div>
      </div>
    </section>
  );
}
