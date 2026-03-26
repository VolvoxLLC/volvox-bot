'use client';

import { motion, useInView } from 'framer-motion';
import { Clock, Terminal, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedCounter, formatNumber } from './AnimatedCounter';
import { ScrollStage } from './ScrollStage';

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

// ─── Testimonial placeholders ────────────────────────────────────────────────

const testimonials = [
  {
    id: 'testimonial-1',
    quote: '[Quote from a real user — coming soon]',
    author: 'Community Member',
    role: 'Discord Server Admin',
    lineClassName: 'bg-primary/55',
    quoteClassName: 'text-primary/20',
    avatarBg: 'bg-primary/15 text-primary',
    initial: 'C',
  },
  {
    id: 'testimonial-2',
    quote: '[Quote from a real user — coming soon]',
    author: 'Community Member',
    role: 'Developer',
    lineClassName: 'bg-secondary/60',
    quoteClassName: 'text-secondary/20',
    avatarBg: 'bg-secondary/15 text-secondary',
    initial: 'C',
  },
  {
    id: 'testimonial-3',
    quote: '[Quote from a real user — coming soon]',
    author: 'Community Member',
    role: 'Open Source Contributor',
    lineClassName: 'bg-accent/65',
    quoteClassName: 'text-accent/25',
    avatarBg: 'bg-accent/15 text-accent',
    initial: 'C',
  },
];

// ─── Main Stats Component ─────────────────────────────────────────────────────

export function Stats() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });

  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BotStats = await res.json();
        if (!cancelled) {
          setStats(data);
          setError(false);
          setLoading(false);
          failCountRef.current = 0;
          timeoutId = setTimeout(fetchStats, 60_000);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
          failCountRef.current += 1;
          const backoff = Math.min(60_000 * 2 ** (failCountRef.current - 1), 300_000);
          timeoutId = setTimeout(fetchStats, backoff);
        }
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const s = stats ?? {
    servers: 0,
    members: 0,
    commandsServed: 0,
    activeConversations: 0,
    uptime: 0,
    messagesProcessed: 0,
    cachedAt: '',
  };

  const condensedStats = [
    {
      icon: <Users className="w-5 h-5" />,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      value: s.members,
      label: 'Members',
      formatter: formatNumber,
    },
    {
      icon: <Terminal className="w-5 h-5" />,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
      value: s.commandsServed,
      label: 'Commands Served',
      formatter: formatNumber,
    },
    {
      icon: <Clock className="w-5 h-5" />,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      value: s.uptime,
      label: 'Uptime',
      formatter: formatUptime,
    },
  ];

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto" ref={containerRef}>
        <ScrollStage>
          {/* Testimonials */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-20"
          >
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-center text-foreground mb-14">
              Loved by <span className="text-aurora">developers</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                  className="p-8 rounded-2xl border border-border bg-card relative hover:-translate-y-1 transition-transform duration-300"
                >
                  <div className={`absolute inset-x-0 top-0 h-px ${t.lineClassName}`} />
                  <div
                    className={`absolute top-5 left-6 text-5xl font-serif leading-none ${t.quoteClassName}`}
                  >
                    &ldquo;
                  </div>
                  <p className="text-foreground/60 italic mb-5 pt-8 relative z-10 leading-relaxed">
                    {t.quote}
                  </p>
                  <div className="border-t border-border pt-4 flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${t.avatarBg}`}
                    >
                      {t.initial}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">{t.author}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Condensed Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
                    <div key={i} className="text-center p-4">
                      <div className="w-16 h-8 rounded-lg bg-muted animate-pulse mx-auto mb-2" />
                      <div className="w-20 h-4 rounded bg-muted animate-pulse mx-auto" />
                    </div>
                  ))
                : error && !stats
                  ? condensedStats.map((stat) => (
                      <div key={stat.label} className="text-center p-4">
                        <div
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${stat.bgColor} ${stat.color}`}
                        >
                          {stat.icon}
                        </div>
                        <div className="text-2xl font-bold text-muted-foreground mb-1">—</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </div>
                    ))
                  : condensedStats.map((stat) => (
                      <div key={stat.label} className="text-center p-4">
                        <div
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg mb-2 ${stat.bgColor} ${stat.color}`}
                        >
                          {stat.icon}
                        </div>
                        <div className="text-2xl font-bold text-foreground mb-1 tabular-nums">
                          <AnimatedCounter target={stat.value} formatter={stat.formatter} />
                        </div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </div>
                    ))}
            </div>
            <p className="text-center text-xs text-muted-foreground/60 mt-4">
              Live data · refreshed every minute
            </p>
          </motion.div>
        </ScrollStage>
      </div>
    </section>
  );
}
