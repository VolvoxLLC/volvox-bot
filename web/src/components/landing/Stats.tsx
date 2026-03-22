'use client';

import { motion, useInView } from 'framer-motion';
import { Activity, Clock, Globe, MessageSquare, Terminal, Users } from 'lucide-react';
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

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="relative p-6 rounded-2xl border border-border bg-card overflow-hidden">
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
        style={{
          background: [
            'linear-gradient(',
            '90deg, ',
            'transparent 0%, ',
            'hsl(var(--primary) / 0.04) 35%, ',
            'hsl(var(--secondary) / 0.05) 50%, ',
            'hsl(var(--primary) / 0.04) 65%, ',
            'transparent 100%',
            ')',
          ].join(''),
        }}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
        <div className="w-24 h-8 rounded-lg bg-muted animate-pulse" />
        <div className="w-20 h-4 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  readonly icon: React.ReactNode;
  readonly color: string;
  readonly value: number;
  readonly label: string;
  readonly formatter?: (n: number) => string;
  readonly delay: number;
  readonly isInView: boolean;
}

function StatCard({
  icon,
  color,
  value,
  label,
  formatter = formatNumber,
  delay,
  isInView,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative p-6 rounded-2xl border border-border bg-card hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden text-center"
    >
      {/* Icon */}
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>

      {/* Value */}
      <div className="text-3xl sm:text-4xl font-extrabold text-foreground mb-2 tabular-nums tracking-tight">
        <AnimatedCounter target={value} formatter={formatter} />
      </div>

      {/* Label */}
      <div className="text-sm text-muted-foreground font-medium">{label}</div>
    </motion.div>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
  {
    id: 'testimonial-1',
    quote: "Finally, a Discord bot that doesn't suck. The AI actually understands context.",
    author: 'Sarah Chen',
    role: 'DevOps Engineer @ TechFlow',
    lineClassName: 'bg-primary/55',
    quoteClassName: 'text-primary/20',
  },
  {
    id: 'testimonial-2',
    quote: "We migrated from MEE6 and never looked back. The dashboard is chef's kiss.",
    author: 'Marcus Johnson',
    role: 'Community Manager @ Streamline',
    lineClassName: 'bg-secondary/60',
    quoteClassName: 'text-secondary/20',
  },
  {
    id: 'testimonial-3',
    quote: 'Self-hosted in 10 minutes. The docs are actually readable. Revolutionary.',
    author: 'Alex Rivera',
    role: 'Founder @ OpenSaaS',
    lineClassName: 'bg-accent/65',
    quoteClassName: 'text-accent/25',
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

  const statCards = [
    {
      icon: <Globe className="w-6 h-6" />,
      color: '#22c55e',
      value: s.servers,
      label: 'Servers',
      formatter: formatNumber,
    },
    {
      icon: <Users className="w-6 h-6" />,
      color: '#8c42d7',
      value: s.members,
      label: 'Members',
      formatter: formatNumber,
    },
    {
      icon: <Terminal className="w-6 h-6" />,
      color: '#ff8c00',
      value: s.commandsServed,
      label: 'Commands Served',
      formatter: formatNumber,
    },
    {
      icon: <MessageSquare className="w-6 h-6" />,
      color: '#af58da',
      value: s.activeConversations,
      label: 'Active Conversations',
      formatter: formatNumber,
    },
    {
      icon: <Clock className="w-6 h-6" />,
      color: '#14b8a6',
      value: s.uptime,
      label: 'Uptime',
      formatter: formatUptime,
    },
    {
      icon: <Activity className="w-6 h-6" />,
      color: '#f43f5e',
      value: s.messagesProcessed,
      label: 'Messages Processed',
      formatter: formatNumber,
    },
  ];

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto" ref={containerRef}>
        <ScrollStage>
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
              Live bot stats
            </h2>
            <p className="text-muted-foreground text-sm">
              Real-time data, refreshed every minute
              {stats?.cachedAt && (
                <span className="ml-2 opacity-50">
                  · as of {new Date(stats.cachedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-24">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : error && !stats
                ? statCards.map((card, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 24 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.5, delay: i * 0.07 }}
                      className="p-6 rounded-2xl border border-border bg-card text-center"
                    >
                      <div
                        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                        style={{
                          backgroundColor: `${card.color}15`,
                          color: card.color,
                        }}
                      >
                        {card.icon}
                      </div>
                      <div className="text-3xl font-bold text-muted-foreground mb-2">—</div>
                      <div className="text-sm text-muted-foreground">{card.label}</div>
                    </motion.div>
                  ))
                : statCards.map((card, i) => (
                    <StatCard
                      key={i}
                      icon={card.icon}
                      color={card.color}
                      value={card.value}
                      label={card.label}
                      formatter={card.formatter}
                      delay={i * 0.07}
                      isInView={isInView}
                    />
                  ))}
          </div>

          {/* Testimonials */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-14"
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
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                  className="p-8 rounded-2xl border border-border bg-card relative hover:-translate-y-1 transition-transform duration-300"
                >
                  <div className={`absolute inset-x-0 top-0 h-px ${t.lineClassName}`} />
                  <div
                    className={`absolute top-5 left-6 text-5xl font-serif leading-none ${t.quoteClassName}`}
                  >
                    &ldquo;
                  </div>
                  <p className="text-foreground mb-5 pt-8 relative z-10 leading-relaxed">
                    {t.quote}
                  </p>
                  <div className="border-t border-border pt-4">
                    <div className="font-semibold text-foreground">{t.author}</div>
                    <div className="text-sm text-muted-foreground">{t.role}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Trust Badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-center"
          >
            <p className="text-muted-foreground text-sm">
              Trusted by teams at leading tech companies and thousands of open-source communities
            </p>
          </motion.div>
        </ScrollStage>
      </div>
    </section>
  );
}
