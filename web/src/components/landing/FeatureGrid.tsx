'use client';

import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Activity, Cpu, Globe, Lock, MessageSquare, Shield, Sparkles, Zap } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly accentColor: string;
  readonly preview: React.ReactNode;
  readonly size: 'small' | 'medium' | 'large';
  readonly className?: string;
}

const features: readonly Feature[] = [
  {
    icon: MessageSquare,
    title: 'Neural Chat',
    description:
      'Multi-turn, context-aware conversations powered by Claude. Synthesis of intelligence directly in your channels.',
    accentColor: 'hsl(var(--primary))',
    size: 'large',
    className: 'md:col-span-2 lg:col-span-2',
    preview: (
      <div className="space-y-3 text-[12px] font-medium leading-relaxed">
        <div className="flex gap-3 text-foreground/40">
          <span className="font-mono opacity-50">user_</span>
          <span className="text-foreground/80">Summarize the recent community update.</span>
        </div>
        <div className="flex gap-3 text-primary bg-primary/5 p-4 rounded-2xl border border-primary/10 backdrop-blur-sm">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="text-foreground/90 dark:text-white/90">
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
    accentColor: 'hsl(var(--destructive))',
    size: 'medium',
    className: 'md:col-span-1 lg:col-span-1',
    preview: (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[10px] bg-destructive/5 px-3 py-2 rounded-xl border border-destructive/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-destructive font-black uppercase tracking-wider font-mono">
              Intercepted
            </span>
          </div>
          <span className="text-foreground/20 font-mono">0.02ms</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-foreground/60 px-2">
          <Lock className="w-3.5 h-3.5 text-destructive/60" />
          <span>Spam cluster quarantined (8 accounts)</span>
        </div>
      </div>
    ),
  },
  {
    icon: Activity,
    title: 'Live Insight',
    description: 'Real-time analytics and server health metrics visualized instantly.',
    accentColor: 'hsl(var(--secondary))',
    size: 'medium',
    className: 'md:col-span-1 lg:col-span-1',
    preview: (
      <div className="flex items-end gap-2 h-16 px-2">
        {[40, 75, 55, 90, 65, 85, 45, 70].map((h, i) => (
          <motion.div
            key={`bar-${i}`}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            transition={{ delay: i * 0.05, duration: 0.8, ease: 'circOut' }}
            className="flex-1 rounded-t-[2px] bg-gradient-to-t from-secondary/5 via-secondary/40 to-secondary"
          />
        ))}
      </div>
    ),
  },
  {
    icon: Zap,
    title: 'Edge Performance',
    description: 'Built for scale. Minimal latency across all global regions.',
    accentColor: 'hsl(var(--primary))',
    size: 'small',
    className: 'md:col-span-1 lg:col-span-1',
    preview: (
      <div className="flex items-center justify-center py-2">
        <div className="relative w-full h-10 bg-foreground/5 rounded-2xl border border-border flex items-center px-4 overflow-hidden">
          <motion.div
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/30 to-transparent scan-line"
          />
          <Globe className="w-4 h-4 text-primary/60 mr-3" />
          <span className="text-[10px] font-black tracking-[0.2em] text-foreground/40 uppercase font-mono">
            Ping: 12ms
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: Cpu,
    title: 'Core Engine',
    description: 'Highly optimized architecture designed for 99.99% uptime.',
    accentColor: 'hsl(var(--primary))',
    size: 'small',
    className: 'md:col-span-1 lg:col-span-1',
    preview: (
      <div className="grid grid-cols-4 gap-2 opacity-40">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`core-i-${i}`}
            className="h-6 rounded-md bg-foreground/10 border border-border"
          />
        ))}
      </div>
    ),
  },
];

function FeatureCard({
  feature,
  index,
  shouldReduceMotion,
}: {
  readonly feature: Feature;
  readonly index: number;
  readonly shouldReduceMotion: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const { left, top } = cardRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const bgImage = useTransform([mouseX, mouseY], ([x, y]) => {
    const glowColor = feature.accentColor.replace('hsl(', '').replace(')', '');
    return `radial-gradient(600px circle at ${x}px ${y}px, hsl(${glowColor}/0.06), transparent 40%)`;
  });

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{
        duration: 0.8,
        delay: shouldReduceMotion ? 0 : index * 0.1,
        ease: [0.21, 1.02, 0.47, 0.98],
      }}
      className={cn(
        'group relative overflow-hidden rounded-[2.5rem] border border-border bg-card/50 backdrop-blur-xl p-8 lg:p-10 transition-colors hover:border-primary/20 flex flex-col justify-between shadow-sm',
        feature.className,
      )}
    >
      {/* Interactive Glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: bgImage }}
      />

      {/* Content */}
      <div className="relative z-10">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-8 bg-muted border border-border shadow-inner group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-500"
          style={{ color: 'hsl(var(--primary))' }}
        >
          <feature.icon
            className="w-6 h-6"
            aria-hidden="true"
            style={{ color: feature.accentColor }}
          />
        </div>

        <h3 className="text-2xl font-black tracking-tight text-foreground mb-4">{feature.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground mb-8 font-medium max-w-sm">
          {feature.description}
        </p>
      </div>

      {/* Preview Inset */}
      <div className="relative z-10 mt-auto overflow-hidden rounded-3xl bg-foreground/[0.02] border border-border p-6 backdrop-blur-md shadow-inner group-hover:bg-foreground/[0.04] transition-colors duration-500">
        {feature.preview}
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="relative py-40 px-4 sm:px-6 lg:px-8 bg-background overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none opacity-20 dark:opacity-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[120px] rounded-full" />
      </div>

      <div className="mx-auto max-w-7xl relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-32">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="flex items-center gap-4 mb-10 opacity-60 dark:opacity-40"
          >
            <div className="h-[1px] w-12 bg-foreground/40" />
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-foreground">
              System Protocol
            </span>
            <div className="h-[1px] w-12 bg-foreground/40" />
          </motion.div>

          <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-foreground mb-8 max-w-4xl leading-[0.9]">
            Everything you need,
            <br />
            <span className="text-primary italic">re-engineered.</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl font-light leading-relaxed tracking-tight">
            Volvox consolidates your entire community stack into a single, high-performance
            architecture.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              feature={feature}
              index={index}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
