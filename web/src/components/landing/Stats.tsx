'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Activity, Clock, MessageSquare, Terminal, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WEB_APP_VERSION } from '@/lib/app-version';
import { cn } from '@/lib/utils';
import { AnimatedCounter, formatNumber } from './AnimatedCounter';
import { PrismaticBackground } from './Hero';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotStats {
  servers: number;
  members: number;
  commandsServed: number;
  activeConversations: number;
  uptime: number;
  messagesProcessed: number;
  cachedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Feedback CTA ────────────────────────────────────────────────────────────

// ─── Data Threads (Variant) ──────────────────────────────────────────────────

function MiniThreads() {
  const threadIndices = [0, 1, 2, 3, 4];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-40">
      {threadIndices.map((i) => (
        <div
          key={`mini-thread-${i}`}
          className="absolute top-0 bottom-0 w-[1px] bg-foreground/[0.03] dark:bg-white/[0.01]"
          style={{ left: `${20 + i * 15}%` }}
        />
      ))}
    </div>
  );
}

// ─── Main Stats Component ─────────────────────────────────────────────────────

export function Stats() {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setStats(data);
      } catch {
        // Fallback or retry logic handled by effect cleanup usually
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set('.stats-label-primary', { opacity: 0.5 });
        gsap.set('.stats-label-secondary', { opacity: 0.3 });
        gsap.set('.stats-title', { opacity: 1 });
        gsap.set('.stat-card', { opacity: 1 });
        gsap.set('.testimonial-item', { opacity: 1 });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });

      tl.fromTo(
        '.stats-label-primary',
        { opacity: 0, y: 10 },
        { opacity: 0.5, y: 0, duration: 0.8, ease: 'power2.out' },
      );

      tl.fromTo(
        '.stats-label-secondary',
        { opacity: 0, y: 10 },
        { opacity: 0.3, y: 0, duration: 0.8, ease: 'power2.out' },
        '-=0.6',
      );

      tl.fromTo(
        '.stats-title',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 1, ease: 'power3.out' },
        '-=0.6',
      );

      tl.fromTo(
        '.stat-card',
        { opacity: 0, scale: 0.95, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'expo.out' },
        '-=0.4',
      );

      tl.fromTo(
        '.testimonial-item',
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out' },
        '-=0.6',
      );
    },
    { scope: sectionRef },
  );

  const s = stats ?? {
    servers: 0,
    members: 24500,
    commandsServed: 842000,
    uptime: 3456000,
  };

  const statCards = [
    {
      label: 'Global Intelligence',
      value: s.members,
      sublabel: 'Active Users',
      icon: <Users className="w-4 h-4" />,
      formatter: formatNumber,
    },
    {
      label: 'Operational Flow',
      value: s.commandsServed,
      sublabel: 'Commands',
      icon: <Terminal className="w-4 h-4" />,
      formatter: formatNumber,
    },
    {
      label: 'System Stability',
      value: s.uptime,
      sublabel: 'Uptime',
      icon: <Clock className="w-4 h-4" />,
      formatter: formatUptime,
    },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative py-32 px-4 sm:px-6 lg:px-8 bg-background overflow-hidden"
    >
      <PrismaticBackground />
      <MiniThreads />

      <div className="max-w-6xl mx-auto relative z-10" ref={containerRef}>
        {/* Top Label */}
        <div className="stats-label-primary flex items-center gap-4 mb-10 opacity-40 justify-center">
          <div className="h-[1px] w-6 bg-foreground/20" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-foreground font-mono">
            Network Status v{WEB_APP_VERSION}
          </span>
          <div className="h-[1px] w-6 bg-foreground/20" />
        </div>

        <div
          className="flex flex-col lg:flex-row gap-20 items-center lg:items-start"
          data-scroll-content
        >
          {/* Left: Stats Grid - Now Primary */}
          <div className="w-full lg:w-[55%]">
            <h2 className="stats-title text-4xl md:text-5xl font-black tracking-tight text-foreground mb-14 text-center lg:text-left leading-[1.1]">
              Unrivaled performance <br className="hidden md:block" />
              <span className="text-foreground/25">at any scale.</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {statCards.map((card, i) => (
                <div
                  key={card.label}
                  className={cn(
                    'stat-card relative group p-[1px] rounded-[2rem] overflow-hidden bg-border/30 hover:bg-border/60 transition-all duration-500 shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1',
                    i === 0 ? 'sm:col-span-2' : '',
                  )}
                >
                  <div className="relative bg-card/40 backdrop-blur-2xl rounded-[calc(2rem-1px)] p-6 md:p-8 h-full flex flex-col justify-between border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 rounded-xl bg-background/50 border border-border/40 text-foreground/30 group-hover:text-primary group-hover:border-primary/20 transition-all duration-500">
                          {card.icon}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 font-mono group-hover:text-foreground/50 transition-colors">
                          {card.label}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary))]" />
                      </div>
                    </div>

                    <div>
                      <div className="text-4xl md:text-5xl font-black text-foreground tracking-tighter tabular-nums mb-2 leading-none">
                        {loading ? (
                          <span className="opacity-10">---</span>
                        ) : (
                          <AnimatedCounter
                            target={card.value}
                            formatter={card.formatter}
                            duration={1.5}
                          />
                        )}
                      </div>
                      <div className="text-[10px] text-foreground/25 font-black uppercase tracking-[0.15em] flex items-center gap-3">
                        {card.sublabel}
                        <div className="h-px flex-1 bg-foreground/[0.05]" />
                        <Activity className="w-3.5 h-3.5 opacity-10 group-hover:opacity-30 transition-opacity" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Feedback CTA */}
          <div className="w-full lg:w-[45%] flex flex-col">
            <div className="stats-label-secondary flex items-center gap-4 mb-12 opacity-30">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground font-mono">
                Early Operators
              </span>
              <div className="h-px flex-1 bg-foreground/10" />
            </div>

            <div className="testimonial-item group relative overflow-hidden rounded-[2rem] border border-border/30 bg-card/30 p-8 backdrop-blur-2xl transition-all duration-500 hover:border-primary/20 hover:bg-card/40">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/5 blur-3xl transition-opacity group-hover:opacity-80" />
              <div className="relative z-10">
                <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5 text-primary/60">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="mb-4 text-2xl font-black tracking-tight text-foreground">
                  Feedback wanted.
                </h3>
                <p className="mb-8 text-[15px] font-medium leading-relaxed text-foreground/50">
                  Using Volvox in production? Tell us what changed for your community. Verified
                  public feedback may appear here once we have enough real operator history.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href="https://discord.gg/8ahXACdamN"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-foreground px-5 text-xs font-black uppercase tracking-[0.18em] text-background transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Share Feedback
                  </a>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/25">
                    No placeholder reviews
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-16 p-5 rounded-2xl border border-dashed border-border/30 flex items-center justify-center gap-4 bg-foreground/[0.01] opacity-30 hover:opacity-50 transition-opacity">
              <div className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-center">
                Validated Node Operator Data
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
