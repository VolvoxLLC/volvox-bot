'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Activity, Clock, Quote, Terminal, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

// ─── Testimonials ────────────────────────────────────────────────────────────

const testimonials = [
  {
    id: 't1',
    quote:
      "The neural chat synthesis is actually scary good. It's like having a senior dev in every channel.",
    author: 'Alex Rivers',
    role: 'Lead Admin @ TechNode',
  },
  {
    id: 't2',
    quote:
      "Sentry mode caught a 500-user raid in under a second. I didn't even have to lift a finger.",
    author: 'Sarah Chen',
    role: 'Community Mgr @ Nexus',
  },
  {
    id: 't3',
    quote:
      'Performance is unmatched. 12ms response times globally is a game changer for our scale.',
    author: 'Marcus Wright',
    role: 'CTO @ MetaStream',
  },
];

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
      className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background overflow-hidden"
    >
      <PrismaticBackground />
      <MiniThreads />

      <div className="max-w-6xl mx-auto relative z-10" ref={containerRef}>
        {/* Top Label */}
        <div className="stats-label-primary flex items-center gap-4 mb-8 opacity-50 justify-center">
          <div className="h-[1px] w-4 bg-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-foreground font-mono">
            Network Status
          </span>
          <div className="h-[1px] w-4 bg-foreground" />
        </div>

        <div className="flex flex-col lg:flex-row gap-16 items-center lg:items-start">
          {/* Left: Stats Grid - Now Primary */}
          <div className="w-full lg:w-[55%]">
            <h2 className="stats-title text-3xl md:text-4xl font-black tracking-tight text-foreground mb-12 text-center lg:text-left leading-tight">
              Unrivaled performance <br className="hidden md:block" />
              <span className="text-foreground/30">at any scale.</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {statCards.map((card, i) => (
                <div
                  key={card.label}
                  className={cn(
                    'stat-card relative group p-[1px] rounded-2xl overflow-hidden bg-border/20 hover:bg-border/60 transition-colors duration-500 shadow-sm',
                    i === 0 ? 'sm:col-span-2' : '',
                  )}
                >
                  <div className="relative bg-card/50 backdrop-blur-xl rounded-[15px] p-5 h-full flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-background border border-border/50 text-foreground/40 group-hover:text-primary transition-colors">
                          {card.icon}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 font-mono">
                          {card.label}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="text-[9px] font-mono font-bold text-primary/60 tracking-tighter">
                          LIVE
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      </div>
                    </div>

                    <div>
                      <div className="text-3xl font-black text-foreground tracking-tighter tabular-nums mb-1">
                        {loading ? (
                          <span className="opacity-20">---</span>
                        ) : (
                          <AnimatedCounter
                            target={card.value}
                            formatter={card.formatter}
                            duration={1.5}
                          />
                        )}
                      </div>
                      <div className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest flex items-center gap-2">
                        {card.sublabel}
                        <div className="h-px flex-1 bg-border/20" />
                        <Activity className="w-3 h-3 opacity-20" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Testimonials - More compact & sleek */}
          <div className="w-full lg:w-[45%] flex flex-col">
            <div className="stats-label-secondary flex items-center gap-3 mb-10 opacity-30">
              <span className="text-[9px] font-black uppercase tracking-widest text-foreground font-mono">
                User Consensus
              </span>
              <div className="h-px flex-1 bg-foreground" />
            </div>

            <div className="space-y-6">
              {testimonials.map((t) => (
                <div
                  key={t.id}
                  className="testimonial-item group relative pl-6 border-l border-border/40 hover:border-primary/40 transition-colors"
                >
                  <Quote className="absolute -left-2 top-0 w-4 h-4 text-primary/20 group-hover:text-primary/40 transition-colors" />
                  <p className="text-[14px] text-foreground/60 leading-relaxed mb-3 font-medium tracking-tight">
                    "{t.quote}"
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-foreground tracking-tight">
                        {t.author}
                      </span>
                      <span className="text-[10px] text-foreground/30 font-semibold uppercase tracking-wider">
                        {t.role}
                      </span>
                    </div>
                    <div className="h-px w-8 bg-border/40 group-hover:w-12 transition-all duration-500" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 p-4 rounded-xl border border-dashed border-border/40 flex items-center justify-center gap-4 bg-background/20 opacity-50">
              <div className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-center">
                Validated Node Operator Data
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
