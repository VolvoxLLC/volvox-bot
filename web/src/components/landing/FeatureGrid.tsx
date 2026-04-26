'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Activity, BookOpen, Cpu, Lock, MessageSquare, Shield, Sparkles } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly preview: React.ReactNode;
  readonly size: 'small' | 'medium' | 'large';
  readonly className?: string;
  readonly animationOrder: number;
}

const liveInsightBars = [
  { id: 'activity-40', height: 40, delayOrder: 0 },
  { id: 'activity-75', height: 75, delayOrder: 1 },
  { id: 'activity-55', height: 55, delayOrder: 2 },
  { id: 'activity-90', height: 90, delayOrder: 3 },
  { id: 'activity-65', height: 65, delayOrder: 4 },
  { id: 'activity-85', height: 85, delayOrder: 5 },
  { id: 'activity-45', height: 45, delayOrder: 6 },
  { id: 'activity-70', height: 70, delayOrder: 7 },
] as const;

const coreEngineCells = [
  'core-alpha',
  'core-beta',
  'core-gamma',
  'core-delta',
  'core-epsilon',
  'core-zeta',
  'core-eta',
  'core-theta',
] as const;

const features: readonly Feature[] = [
  {
    icon: MessageSquare,
    title: 'Neural Chat',
    description:
      'Multi-turn, context-aware conversations powered by Claude. Synthesis of intelligence directly in your channels.',
    size: 'large',
    className: 'md:col-span-2 lg:col-span-2',
    animationOrder: 0,
    preview: (
      <div className="space-y-4 text-[13px] font-medium leading-relaxed">
        <div className="flex gap-3 text-foreground/40">
          <span className="font-mono opacity-50 shrink-0">usr</span>
          <span className="font-mono opacity-30 truncate">~ [mod-core] scan initialized...</span>
        </div>
        <div className="flex gap-3 text-primary bg-primary/[0.03] p-4 rounded-xl border border-primary/10">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
          <span className="text-foreground/80">
            I've condensed 42 commits into 3 key themes: Stability, UI, and Speed. Engagement is up
            12% this week.
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: Shield,
    title: 'Active Sentry',
    description:
      'Autonomous moderation that identifies and neutralizes raids with surgical precision.',
    size: 'medium',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 1,
    preview: (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-[11px] bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-destructive font-black uppercase tracking-wider font-mono">
              Intercepted
            </span>
          </div>
          <span className="text-foreground/30 font-mono">0.02ms</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-foreground/50 px-1">
          <Lock className="w-3.5 h-3.5 opacity-60" />
          <span>Spam cluster quarantined (8 accounts)</span>
        </div>
      </div>
    ),
  },
  {
    icon: Activity,
    title: 'Live Insight',
    description: 'Real-time analytics and server health metrics visualized instantly.',
    size: 'medium',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 2,
    preview: (
      <div className="flex items-end gap-2 h-20 px-1">
        {liveInsightBars.map((bar) => (
          <motion.div
            key={bar.id}
            initial={{ height: 0 }}
            whileInView={{ height: `${bar.height}%` }}
            transition={{ delay: bar.delayOrder * 0.05, duration: 0.8, ease: 'circOut' }}
            className="flex-1 rounded-[3px] bg-primary/20"
          />
        ))}
      </div>
    ),
  },
  {
    icon: BookOpen,
    title: 'TL;DR',
    description: 'AI-powered conversation summaries. Never miss what happened while you were away.',
    size: 'small',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 3,
    preview: (
      <div className="space-y-3 text-[12px]">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <span>📋</span>
          <span>TL;DR Summary</span>
        </div>
        <div className="text-foreground/50 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-primary">🗝️</span>
            <span className="truncate">3 key topics identified</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-primary">✅</span>
            <span className="truncate">2 decisions made</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-primary">📌</span>
            <span className="truncate">4 action items</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Cpu,
    title: 'Core Engine',
    description: 'Highly optimized architecture designed for 99.99% uptime.',
    size: 'small',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 4,
    preview: (
      <div className="grid grid-cols-4 gap-2 opacity-50 h-full content-center">
        {coreEngineCells.map((cellId) => (
          <div key={cellId} className="h-6 rounded-full bg-foreground/5 border border-border/60" />
        ))}
      </div>
    ),
  },
];

function FeatureCard({
  feature,
  shouldReduceMotion,
}: {
  readonly feature: Feature;
  readonly shouldReduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{
        duration: 0.6,
        delay: shouldReduceMotion ? 0 : feature.animationOrder * 0.05,
        ease: [0.21, 1.02, 0.47, 0.98],
      }}
      className={cn(
        'group relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-8 transition-all hover:border-border flex flex-col justify-between shadow-sm',
        feature.className,
      )}
    >
      <div className="relative z-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-[14px] mb-6 bg-secondary/50 border border-border/50 text-muted-foreground transition-colors group-hover:text-primary group-hover:bg-secondary/70">
          <feature.icon className="w-[22px] h-[22px]" aria-hidden="true" />
        </div>

        <h3 className="text-[22px] font-bold tracking-tight text-foreground mb-3">
          {feature.title}
        </h3>
        <p className="text-[15px] leading-relaxed text-foreground/50 mb-8 font-medium max-w-sm">
          {feature.description}
        </p>
      </div>

      <div className="relative z-10 mt-auto overflow-hidden rounded-2xl bg-background border border-border/30 p-5 shadow-sm h-full max-h-[140px] flex flex-col justify-center">
        {feature.preview}
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  const [mounted, setMounted] = React.useState(false);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const shouldReduceMotion = mounted ? (reducedMotion ?? false) : (reducedMotion ?? true);

  return (
    <section className="relative py-32 px-4 sm:px-6 lg:px-8 bg-background overflow-hidden">
      <div className="mx-auto max-w-6xl relative z-10">
        <div className="flex flex-col mb-24 max-w-3xl">
          <div className="flex items-center gap-3 mb-6 opacity-80">
            <div className="w-8 h-[1px] bg-primary/40" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              System Protocol
            </span>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-6 leading-tight">
            Everything you need,
            <br />
            <span className="text-foreground/40">re-engineered.</span>
          </h2>
          <p className="text-lg text-foreground/50 max-w-xl font-medium leading-relaxed">
            Volvox consolidates your entire community stack into a single, high-performance
            architecture.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              feature={feature}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
