'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Brain, FileText, Lock, MessageSquare, Shield, Trophy } from 'lucide-react';
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

const features: readonly Feature[] = [
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description: 'Mention the bot for casual, context-aware conversations in your server.',
    size: 'large',
    className: 'md:col-span-2 lg:col-span-2',
    animationOrder: 0,
    preview: (
      <div className="space-y-4 text-[13px] font-medium leading-relaxed">
        <div className="flex gap-3 text-foreground/40">
          <span className="font-mono opacity-50 shrink-0">usr</span>
          <span className="font-mono opacity-50 truncate">@Volvox hey, how's your day going?</span>
        </div>
        <div className="flex gap-3 bg-primary/[0.03] p-4 rounded-xl border border-primary/10">
          <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-primary/70" />
          <span className="text-foreground/80">
            Pretty good. I'm keeping an eye on the server and ready to help if anyone needs
            answers, summaries, or a second opinion.
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: Shield,
    title: 'AI Auto-Moderation',
    description:
      'Automated toxicity, spam, and harassment detection with configurable thresholds.',
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
    icon: Trophy,
    title: 'Reputation / XP System',
    description: 'Engagement tracking with configurable levels and role rewards.',
    size: 'medium',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 2,
    preview: (
      <div className="space-y-3 py-1">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-foreground/50">
          <span>Level 12</span>
          <span>8,420 XP</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '72%' }}
            transition={{ duration: 0.8, ease: 'circOut' }}
            className="h-full rounded-full bg-primary/70"
          />
        </div>
        <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-[11px] font-medium text-foreground/60">
          Next reward: <span className="text-primary">Community Regular</span>
        </div>
      </div>
    ),
  },
  {
    icon: Brain,
    title: 'User Memory',
    description: 'Long-term memory per user for personalized interactions.',
    size: 'small',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 3,
    preview: (
      <div className="space-y-2 py-1 text-[11px]">
        <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2">
          <div className="mb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-primary/70">
            Memory Recall
          </div>
          <p className="font-medium leading-snug text-foreground/70">
            Prefers concise answers and Next.js examples.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-foreground/40">
          <span>3 facts attached</span>
          <span>user scoped</span>
        </div>
      </div>
    ),
  },
  {
    icon: FileText,
    title: 'TL;DR',
    description: 'AI-powered conversation summaries. Never miss what happened while you were away.',
    size: 'small',
    className: 'md:col-span-1 lg:col-span-1',
    animationOrder: 4,
    preview: (
      <div className="space-y-2 py-1 text-[11px]">
        <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-foreground/40">
          84 messages summarized
        </div>
        <div className="rounded-xl border border-border/50 bg-background/40 px-3 py-2">
          <ul className="space-y-1.5 font-medium leading-snug text-foreground/65">
            <li>• Launch moved to Friday</li>
            <li>• Two blockers assigned</li>
            <li>• Poll closes tonight</li>
          </ul>
        </div>
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
            Volvox brings your community tools into one clean, powerful command center.
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
