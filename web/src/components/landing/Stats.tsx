'use client';

import { motion, useInView } from 'framer-motion';
import { Activity, Clock, Globe, MessageSquare, Terminal, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── AnimatedCounter ─────────────────────────────────────────────────────────

function AnimatedCounter({
  target,
  duration = 2,
  formatter = formatNumber,
}: {
  target: number;
  duration?: number;
  formatter?: (n: number) => string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView) return;

    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      // Ease-out cubic for a snappy feel
      const eased = 1 - (1 - progress) ** 3;
      setCount(Math.floor(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isInView, target, duration]);

  return <span ref={ref}>{formatter(count)}</span>;
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="relative p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-hidden">
      {/* shimmer overlay */}
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
        }}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[var(--bg-secondary)] animate-pulse" />
        <div className="w-24 h-8 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
        <div className="w-20 h-4 rounded bg-[var(--bg-secondary)] animate-pulse" />
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  value: number;
  label: string;
  formatter?: (n: number) => string;
  delay: number;
  isInView: boolean;
}

function StatCard({
  icon,
  iconColor,
  iconBg,
  value,
  label,
  formatter = formatNumber,
  delay,
  isInView,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] hover:border-[var(--border-muted)] transition-colors overflow-hidden text-center"
    >
      {/* Subtle background glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(circle at 50% 0%, ${iconBg}20 0%, transparent 70%)` }}
      />

      {/* Icon */}
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 relative"
        style={{ backgroundColor: `${iconBg}22` }}
      >
        {/* Icon glow */}
        <div
          className="absolute inset-0 rounded-xl blur-sm opacity-40"
          style={{ backgroundColor: iconBg }}
        />
        <span className="relative" style={{ color: iconColor }}>
          {icon}
        </span>
      </div>

      {/* Value */}
      <div className="text-3xl sm:text-4xl font-bold font-mono text-[var(--text-primary)] mb-2 tabular-nums">
        <AnimatedCounter target={value} formatter={formatter} />
      </div>

      {/* Label */}
      <div className="text-sm text-[var(--text-secondary)] font-medium">{label}</div>
    </motion.div>
  );
}

// ─── Testimonials data ────────────────────────────────────────────────────────

const testimonials: { id: string; quote: string; author: string; role: string }[] = [
  {
    id: 'testimonial-1',
    quote: "Finally, a Discord bot that doesn't suck. The AI actually understands context.",
    author: 'Sarah Chen',
    role: 'DevOps Engineer @ TechFlow',
  },
  {
    id: 'testimonial-2',
    quote: "We migrated from MEE6 and never looked back. The dashboard is chef's kiss.",
    author: 'Marcus Johnson',
    role: 'Community Manager @ Streamline',
  },
  {
    id: 'testimonial-3',
    quote: 'Self-hosted in 10 minutes. The docs are actually readable. Revolutionary.',
    author: 'Alex Rivera',
    role: 'Founder @ OpenSaaS',
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
          // Refresh every 60s on success
          timeoutId = setTimeout(fetchStats, 60_000);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
          failCountRef.current += 1;
          // Back off: 60s, 120s, 240s, max 5 min
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

  // Derived stat values — fall back to 0 on error so counters still render
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
      iconColor: 'var(--accent-primary)',
      iconBg: '#3b82f6',
      value: s.servers,
      label: 'Servers',
      formatter: formatNumber,
    },
    {
      icon: <Users className="w-6 h-6" />,
      iconColor: 'var(--accent-success)',
      iconBg: '#22c55e',
      value: s.members,
      label: 'Members',
      formatter: formatNumber,
    },
    {
      icon: <Terminal className="w-6 h-6" />,
      iconColor: 'var(--accent-warning)',
      iconBg: '#f59e0b',
      value: s.commandsServed,
      label: 'Commands Served',
      formatter: formatNumber,
    },
    {
      icon: <MessageSquare className="w-6 h-6" />,
      iconColor: '#a855f7',
      iconBg: '#a855f7',
      value: s.activeConversations,
      label: 'Active Conversations',
      formatter: formatNumber,
    },
    {
      icon: <Clock className="w-6 h-6" />,
      iconColor: '#14b8a6',
      iconBg: '#14b8a6',
      value: s.uptime,
      label: 'Uptime',
      formatter: formatUptime,
    },
    {
      icon: <Activity className="w-6 h-6" />,
      iconColor: '#f43f5e',
      iconBg: '#f43f5e',
      value: s.messagesProcessed,
      label: 'Messages Processed',
      formatter: formatNumber,
    },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto" ref={containerRef}>
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold font-mono text-[var(--text-primary)] mb-3">
            Live bot stats
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">
            Real-time data, refreshed every minute
            {stats?.cachedAt && (
              <span className="ml-2 opacity-50">
                · as of {new Date(stats.cachedAt).toLocaleTimeString()}
              </span>
            )}
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          {loading
            ? // Skeleton placeholders
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : error && !stats
              ? // Error fallback: show dashes
                statCards.map((card, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 24 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.5, delay: i * 0.07 }}
                    className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] text-center"
                  >
                    <div
                      className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                      style={{ backgroundColor: `${card.iconBg}22`, color: card.iconColor }}
                    >
                      {card.icon}
                    </div>
                    <div className="text-3xl font-bold font-mono text-[var(--text-muted)] mb-2">
                      —
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">{card.label}</div>
                  </motion.div>
                ))
              : statCards.map((card, i) => (
                  <StatCard
                    key={i}
                    icon={card.icon}
                    iconColor={card.iconColor}
                    iconBg={card.iconBg}
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
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <h2 className="text-3xl font-bold font-mono text-center text-[var(--text-primary)] mb-12">
            Loved by developers
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                className="p-6 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] relative"
              >
                <div className="text-4xl text-[var(--accent-primary)] opacity-30 absolute top-4 left-4 font-serif">
                  &ldquo;
                </div>
                <p className="text-[var(--text-primary)] mb-4 pt-6 relative z-10">{t.quote}</p>
                <div className="border-t border-[var(--border-muted)] pt-4">
                  <div className="font-medium text-[var(--text-primary)]">{t.author}</div>
                  <div className="text-sm text-[var(--text-muted)]">{t.role}</div>
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
          <p className="text-[var(--text-muted)] text-sm">
            Trusted by teams at leading tech companies and thousands of open-source communities
          </p>
        </motion.div>
      </div>
    </section>
  );
}
