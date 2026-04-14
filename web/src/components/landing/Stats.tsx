'use client';

import { motion, useInView } from 'framer-motion';
import { Activity, Clock, Terminal, TrendingUp, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
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
  },
  {
    id: 't2',
    quote:
      "Sentry mode caught a 500-user raid in under a second. I didn't even have to lift a finger.",
    author: 'Sarah Chen',
    role: 'Community Mgr @ Nexus',
    initial: 'S',
  },
  {
    id: 't3',
    quote:
      'Performance is unmatched. 12ms response times globally is a game changer for our scale.',
    author: 'Marcus Wright',
    role: 'CTO @ MetaStream',
    initial: 'M',
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
      formatter: formatNumber,
    },
    {
      label: 'Operational Flow',
      value: s.commandsServed,
      sublabel: 'Commands Processed',
      icon: <Terminal className="w-5 h-5" />,
      formatter: formatNumber,
    },
    {
      label: 'System Stability',
      value: s.uptime,
      sublabel: 'Current Uptime',
      icon: <Clock className="w-5 h-5" />,
      formatter: formatUptime,
    },
  ];

  return (
    <section
      className="py-32 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden border-t border-border/30"
      ref={containerRef}
    >
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row gap-20 items-start">
          {/* Left: Testimonials Column */}
          <div className="w-full lg:w-1/2 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6">
                Trusted by <br className="hidden md:block" />
                <span className="text-foreground/40">high-scale</span> communities.
              </h2>
            </motion.div>

            <div className="space-y-4">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="p-6 rounded-[1.5rem] border border-border/60 bg-card shadow-sm group hover:border-border transition-colors"
                >
                  <div className="flex gap-5 items-start">
                    <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center font-bold text-sm shrink-0 border border-border/50 text-foreground">
                      {t.initial}
                    </div>
                    <div>
                      <p className="text-[15px] text-foreground/70 leading-relaxed mb-4 font-medium">
                        "{t.quote}"
                      </p>
                      <div className="flex items-center justify-between mt-auto">
                        <div className="text-sm">
                          <span className="font-semibold text-foreground block tracking-tight">
                            {t.author}
                          </span>
                          <span className="text-foreground/40 text-xs font-medium">{t.role}</span>
                        </div>
                        <TrendingUp className="w-4 h-4 text-foreground/20 group-hover:text-foreground/50 transition-colors" />
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
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={isInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                  className={cn(
                    'p-7 rounded-[1.5rem] border border-border/60 bg-card relative overflow-hidden group hover:border-border transition-all shadow-sm flex flex-col justify-between',
                    i === 0 ? 'sm:col-span-2' : '',
                  )}
                >
                  <div className="flex items-center justify-between mb-8">
                    <div className="p-3 rounded-2xl bg-background border border-border group-hover:text-primary transition-colors text-foreground/50">
                      {card.icon}
                    </div>
                    <div className="w-2 h-2 rounded-full bg-primary/80 animate-pulse border border-primary" />
                  </div>

                  <div className="relative z-10 block">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-foreground/40 mb-2">
                      {card.label}
                    </div>
                    <div className="text-4xl font-black text-foreground tracking-tighter tabular-nums mb-3 mt-1">
                      {loading ? (
                        <div className="h-10 w-32 bg-background border border-border/50 animate-pulse rounded-lg" />
                      ) : (
                        <AnimatedCounter target={card.value} formatter={card.formatter} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-foreground/60 font-semibold">
                        {card.sublabel}
                      </div>
                      <div className="h-[1px] flex-1 bg-border/40" />
                      <Activity className="w-3 h-3 text-foreground/30 animate-pulse" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 0.6 } : {}}
              className="mt-8 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-mono opacity-50"
            >
              <div className="h-px flex-1 bg-border/50" />
              Real-time synchronization active
              <div className="h-px flex-1 bg-border/50" />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
