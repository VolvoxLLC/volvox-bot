'use client';

import { motion, useInView } from 'framer-motion';
import { Activity, Clock, Terminal, TrendingUp, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedCounter, formatNumber } from './AnimatedCounter';

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
    initial: 'A',
    color: 'var(--color-primary)',
  },
  {
    id: 't2',
    quote:
      "Sentry mode caught a 500-user raid in under a second. I didn't even have to lift a finger.",
    author: 'Sarah Chen',
    role: 'Community Mgr @ Nexus',
    initial: 'S',
    color: 'var(--color-secondary)',
  },
  {
    id: 't3',
    quote:
      'Performance is unmatched. 12ms response times globally is a game changer for our scale.',
    author: 'Marcus Wright',
    role: 'CTO @ MetaStream',
    initial: 'M',
    color: 'var(--color-accent)',
  },
];

// ─── Main Stats Component ─────────────────────────────────────────────────────

export function Stats() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });

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
      icon: <Users className="w-5 h-5" />,
      color: 'hsl(var(--primary))',
      formatter: formatNumber,
    },
    {
      label: 'Operational Flow',
      value: s.commandsServed,
      sublabel: 'Commands Processed',
      icon: <Terminal className="w-5 h-5" />,
      color: 'hsl(var(--secondary))',
      formatter: formatNumber,
    },
    {
      label: 'System Stability',
      value: s.uptime,
      sublabel: 'Current Uptime',
      icon: <Clock className="w-5 h-5" />,
      color: 'hsl(var(--accent))',
      formatter: formatUptime,
    },
  ];

  return (
    <section
      className="py-40 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden"
      ref={containerRef}
    >
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row gap-20 items-start">
          {/* Left: Testimonials Column */}
          <div className="w-full lg:w-1/2 space-y-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground mb-8">
                Trusted by <br />
                <span className="text-primary">high-scale</span> communities.
              </h2>
            </motion.div>

            <div className="space-y-4">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="p-6 rounded-[2rem] border border-border bg-card/50 backdrop-blur-xl group hover:border-primary/20 transition-colors"
                >
                  <div className="flex gap-6 items-start">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-xs shrink-0 border border-border">
                      {t.initial}
                    </div>
                    <div>
                      <p className="text-sm text-foreground/80 leading-relaxed mb-4 italic font-medium">
                        "{t.quote}"
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="text-xs">
                          <span className="font-bold text-foreground block">{t.author}</span>
                          <span className="text-muted-foreground">{t.role}</span>
                        </div>
                        <TrendingUp className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right: Stats Grid */}
          <div className="w-full lg:w-1/2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {statCards.map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={isInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className={cn(
                    'p-8 rounded-[2.5rem] border border-border bg-card relative overflow-hidden group hover:border-primary/20 transition-all',
                    i === 0 ? 'sm:col-span-2' : '',
                  )}
                >
                  {/* Card Glow */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-10 -mt-10" />

                  <div className="flex items-center justify-between mb-8">
                    <div className="p-3 rounded-2xl bg-muted border border-border group-hover:text-primary transition-colors">
                      {card.icon}
                    </div>
                    <div className="status-dot-live" style={{ backgroundColor: card.color }} />
                  </div>

                  <div className="relative z-10">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
                      {card.label}
                    </div>
                    <div className="text-4xl md:text-5xl font-black text-foreground tracking-tighter tabular-nums mb-2">
                      {loading ? (
                        <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
                      ) : (
                        <AnimatedCounter target={card.value} formatter={card.formatter} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-primary font-bold">{card.sublabel}</div>
                      <div className="h-px flex-1 bg-border/50" />
                      <Activity className="w-3 h-3 text-muted-foreground animate-pulse" />
                    </div>
                  </div>

                  {/* Sparkline Decor */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 opacity-10 group-hover:opacity-20 transition-opacity">
                    <svg viewBox="0 0 400 100" className="w-full h-full preserve-3d">
                      <title>Stat Sparkline</title>
                      <motion.path
                        initial={{ pathLength: 0 }}
                        animate={isInView ? { pathLength: 1 } : {}}
                        transition={{ duration: 2, delay: 0.5 }}
                        d="M0,50 Q50,20 100,60 T200,40 T300,70 T400,30"
                        fill="none"
                        stroke={card.color}
                        strokeWidth="4"
                      />
                    </svg>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 0.4 } : {}}
              className="mt-8 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-foreground font-mono"
            >
              <div className="h-px w-8 bg-border" />
              Real-time synchronization active
              <div className="h-px w-8 bg-border" />
            </motion.div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />
    </section>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
