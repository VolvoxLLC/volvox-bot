'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, MessageSquare, Shield, Star } from 'lucide-react';
import { useRef } from 'react';
import { SectionHeader } from './SectionHeader';
import { ScrollStage } from './ScrollStage';

interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly accentColor: string;
  readonly iconBg: string;
  readonly preview: React.ReactNode;
}

const features: readonly Feature[] = [
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description: 'Reply in-channel with Claude. Context-aware, multi-turn conversations that actually help.',
    accentColor: 'bg-primary',
    iconBg: 'bg-primary/10 text-primary',
    preview: (
      <div className="space-y-2 text-xs">
        <div className="flex gap-2">
          <span className="text-muted-foreground">user:</span>
          <span className="text-foreground">How do I set up auto-roles?</span>
        </div>
        <div className="flex gap-2">
          <span className="text-primary font-medium">bot:</span>
          <span className="text-foreground">Head to Dashboard → Settings → Auto Roles. Pick the role and trigger.</span>
        </div>
      </div>
    ),
  },
  {
    icon: Shield,
    title: 'Moderation',
    description: 'Claude-backed detection for spam, toxicity, and raids. Steps in before your team has to.',
    accentColor: 'bg-secondary',
    iconBg: 'bg-secondary/10 text-secondary',
    preview: (
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-foreground">Spam detected → Message removed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-foreground">User warned — toxicity</span>
          <span className="text-muted-foreground ml-auto">0.3s</span>
        </div>
      </div>
    ),
  },
  {
    icon: Star,
    title: 'Starboard',
    description: 'Best posts become a running highlight reel. Community votes, bot curates.',
    accentColor: 'bg-accent',
    iconBg: 'bg-accent/10 text-accent',
    preview: (
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-accent">⭐</span>
          <span className="text-foreground font-medium">5 reactions</span>
        </div>
        <span className="text-muted-foreground">→</span>
        <span className="text-foreground">promoted to #starboard</span>
      </div>
    ),
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Track server health from the dashboard. Activity, trends, and AI usage in one place.',
    accentColor: 'bg-[hsl(var(--neon-cyan))]',
    iconBg: 'bg-[hsl(var(--neon-cyan))]/10 text-[hsl(var(--neon-cyan))]',
    preview: (
      <div className="flex items-end gap-1 h-8">
        {[40, 65, 45, 80, 55].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-[hsl(var(--neon-cyan))]/30"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    ),
  },
];

function FeatureCard({
  feature,
  index,
  isInView,
  shouldReduceMotion,
}: {
  readonly feature: Feature;
  readonly index: number;
  readonly isInView: boolean;
  readonly shouldReduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.45,
        delay: shouldReduceMotion ? 0 : index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group relative p-6 rounded-2xl border border-border bg-card glow-card overflow-hidden"
    >
      {/* Colored top accent line */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${feature.accentColor} opacity-60`} />

      {/* Icon */}
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-4 ${feature.iconBg}`}>
        <feature.icon className="w-[18px] h-[18px]" aria-hidden="true" />
      </div>

      {/* Title + Description */}
      <h3 className="text-lg font-semibold tracking-tight text-foreground mb-2">{feature.title}</h3>
      <p className="text-sm leading-6 text-muted-foreground mb-4">{feature.description}</p>

      {/* Mini-preview inset */}
      <div className="p-3 rounded-lg bg-muted/50 border border-border/60">
        {feature.preview}
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' }) ?? false;
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="mx-auto max-w-6xl" ref={containerRef}>
        <ScrollStage>
          <SectionHeader
            label="FEATURES"
            labelColor="accent"
            title="Everything you need"
            subtitle="One bot. One dashboard. No stitching together single-purpose tools."
            className="mb-14"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                index={index}
                isInView={isInView}
                shouldReduceMotion={shouldReduceMotion}
              />
            ))}
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
