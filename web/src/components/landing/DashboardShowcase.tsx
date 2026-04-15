'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Globe, Monitor, Terminal, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BentoAIChat } from './bento/BentoAIChat';
import { BentoChart } from './bento/BentoChart';
import { BentoConversations } from './bento/BentoConversations';
import { BentoKpi } from './bento/BentoKpi';
import { BentoModeration } from './bento/BentoModeration';
import type { DailyActivityPoint } from './bento/bento-data';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export type { DailyActivityPoint } from './bento-data';

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
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      gsap.fromTo(
        '.ds-header',
        { y: 30, opacity: 0 },
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

      gsap.fromTo(
        '.ds-window',
        { y: 40, opacity: 0, scale: 0.98 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.ds-window',
            start: 'top 90%',
            toggleActions: 'play reverse play reverse',
          },
        },
      );

      const kpiCards = gsap.utils.toArray<HTMLElement>('.ds-kpi-strip');
      kpiCards.forEach((card, i) => {
        gsap.fromTo(
          card,
          { y: 20, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            delay: i * 0.05,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 95%',
              toggleActions: 'play reverse play reverse',
            },
          },
        );
      });
    },
    { scope: sectionRef },
  );

  type NumericBotStats = Pick<
    BotStats,
    | 'servers'
    | 'members'
    | 'commandsServed'
    | 'activeConversations'
    | 'uptime'
    | 'messagesProcessed'
  >;
  const kpiValue = (field: keyof NumericBotStats): number | null =>
    error && !stats ? null : ((stats?.[field] as number) ?? null);

  return (
    <section
      ref={sectionRef}
      className="px-4 py-32 sm:px-6 lg:px-8 bg-background relative overflow-hidden"
    >
      <div className="mx-auto max-w-7xl relative z-10">
        {/* Section Header */}
        <div className="ds-header flex flex-col items-center text-center mb-24 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6 opacity-80">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/40">
              Control Center
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6 leading-tight">
            Your server, at a glance
          </h2>
          <p className="text-lg text-foreground/50 max-w-xl font-medium leading-relaxed">
            Absolute control over your community, engineered for scale and speed without the
            clutter.
          </p>
        </div>

        {/* ─── Minimal Dashboard Window ─── */}
        <div className="ds-window mx-auto max-w-6xl">
          <div className="bg-card/40 border border-border/80 rounded-[2rem] overflow-hidden shadow-sm backdrop-blur-3xl">
            {/* Title Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/50">
              <div className="flex items-center gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="w-3 h-3 rounded-full bg-border" />
                  <div className="w-3 h-3 rounded-full bg-border" />
                </div>
              </div>
              <div className="flex items-center gap-2 px-5 py-1.5 rounded-full bg-card border border-border/80 shadow-sm">
                <Monitor className="w-[14px] h-[14px] text-muted-foreground/60" />
                <span className="text-[11px] text-muted-foreground font-mono font-medium tracking-tight" suppressHydrationWarning>
                  dashboard.volvox.bot
                </span>
              </div>
              <div className="w-16 hidden sm:block" />
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

              {/* Main Content */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3">
                  <BentoChart dailyActivity={stats?.dailyActivity} />
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 gap-4">
                  <BentoModeration />
                  <BentoConversations />
                </div>
              </div>

              {/* Bottom AI Chat */}
              <div className="w-full">
                <BentoAIChat />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
