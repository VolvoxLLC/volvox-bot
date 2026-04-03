'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Activity, MessageSquare, Shield, Sparkles, Zap } from 'lucide-react';
import { useRef } from 'react';
import { ScrollStage } from './ScrollStage';

interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly accentColor: string;
  readonly preview: React.ReactNode;
}

const features: readonly Feature[] = [
  {
    icon: MessageSquare,
    title: 'Neural Chat',
    description:
      'Multi-turn, context-aware conversations powered by Claude. Synthesis of intelligence directly in your channels.',
    accentColor: 'hsl(var(--primary))',
    preview: (
      <div className="space-y-2 text-[11px] font-medium leading-relaxed">
        <div className="flex gap-2 text-[hsl(var(--foreground))]/40">
          <span>user:</span>
          <span className="text-[hsl(var(--foreground))]">Summarize the update.</span>
        </div>
        <div className="flex gap-2 text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 p-2 rounded-lg border border-[hsl(var(--primary))]/10">
          <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
          <span>I've condensed 42 commits into 3 key themes: Stability, UI, and Speed.</span>
        </div>
      </div>
    ),
  },
  {
    icon: Shield,
    title: 'Active Sentry',
    description:
      'Autonomous moderation that identifies and neutralizes raids, toxicity, and spam with surgical precision.',
    accentColor: 'hsl(var(--accent))',
    preview: (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] bg-[hsl(var(--accent))]/5 px-2 py-1.5 rounded border border-[hsl(var(--accent))]/10">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))] animate-pulse" />
            <span className="text-[hsl(var(--foreground))]/70 font-bold uppercase tracking-wider">
              Intercepted
            </span>
          </div>
          <span className="text-[hsl(var(--foreground))]/40">Just now</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--foreground))]/80 px-2">
          <Shield className="w-3 h-3 text-[hsl(var(--accent))]" />
          <span>Spam cluster quarantined (8 accounts)</span>
        </div>
      </div>
    ),
  },
  {
    icon: Activity,
    title: 'Live Insight',
    description:
      'Real-time analytics and server health metrics. Visualize community growth and activity trends instantly.',
    accentColor: 'hsl(var(--secondary))',
    preview: (
      <div className="flex items-end gap-1.5 h-10 px-1">
        {[40, 75, 55, 90, 65, 85].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            className="flex-1 rounded-t-sm bg-gradient-to-t from-[hsl(var(--secondary))]/10 to-[hsl(var(--secondary))]"
          />
        ))}
      </div>
    ),
  },
  {
    icon: Zap,
    title: 'Edge Performance',
    description:
      'Built for scale. Minimal latency, high availability, and lightning-fast execution across all commands.',
    accentColor: 'hsl(var(--primary))',
    preview: (
      <div className="flex items-center justify-center p-2">
        <div className="relative w-full h-8 bg-[hsl(var(--muted))]/30 rounded-full border border-[hsl(var(--border))]/20 flex items-center px-3 overflow-hidden">
          <motion.div
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-[hsl(var(--primary))]/40 to-transparent"
          />
          <Zap className="w-3 h-3 text-[hsl(var(--primary))] mr-2" />
          <span className="text-[10px] font-black tracking-widest text-[hsl(var(--foreground))]/60 uppercase">
            12ms response
          </span>
        </div>
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
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-200, 200], [10, -10]);
  const rotateY = useTransform(x, [-200, 200], [-10, 10]);

  const springConfig = { damping: 25, stiffness: 150 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.6,
        delay: shouldReduceMotion ? 0 : index * 0.1,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformStyle: 'preserve-3d',
      }}
      className="group relative perspective-1000"
    >
      <div className="glass-morphism-premium rounded-[2.5rem] p-8 md:p-10 h-full border-white/5 shadow-2xl overflow-visible flex flex-col preserve-3d">
        <div className="glass-reflection group-hover:translate-x-full transition-transform duration-1000 ease-in-out opacity-20" />

        {/* Glow effect */}
        <div
          className="absolute -inset-2 opacity-0 group-hover:opacity-100 transition-opacity blur-2xl -z-10 pointer-events-none rounded-full"
          style={{
            background: `radial-gradient(circle, ${feature.accentColor}10 0%, transparent 70%)`,
          }}
        />

        {/* Icon */}
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-8 bg-white/[0.03] border border-white/10 shadow-inner group-hover:scale-110 transition-transform"
          style={{ color: feature.accentColor }}
        >
          <feature.icon className="w-7 h-7" aria-hidden="true" />
        </div>

        {/* Title + Description */}
        <h3 className="text-2xl font-black tracking-tight text-[hsl(var(--foreground))] mb-4">
          {feature.title}
        </h3>
        <p className="text-sm leading-relaxed text-[hsl(var(--foreground))]/50 mb-8 font-medium">
          {feature.description}
        </p>

        {/* Mini-preview inset */}
        <div className="mt-auto p-5 rounded-3xl bg-black/20 border border-white/5 backdrop-blur-md shadow-inner">
          {feature.preview}
        </div>
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  const containerRef = useRef(null);
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8 bg-[var(--background)] overflow-hidden">
      <div className="mx-auto max-w-7xl" ref={containerRef}>
        <ScrollStage>
          <div className="flex flex-col items-center text-center mb-24">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="px-4 py-1.5 rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-[10px] font-black uppercase tracking-[0.3em] mb-8 border border-[hsl(var(--primary))]/20"
            >
              System Capabilities
            </motion.div>
            <h2 className="text-4xl md:text-6xl font-black tracking-tight text-[hsl(var(--foreground))] mb-6 max-w-3xl">
              Everything you need, <br />
              <span className="text-gradient-primary">synthesized.</span>
            </h2>
            <p className="text-lg text-[hsl(var(--foreground))]/40 max-w-2xl font-medium leading-relaxed">
              Volvox consolidates your entire community stack into a single, high-performance
              engine.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 lg:gap-12">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                index={index}
                shouldReduceMotion={shouldReduceMotion}
              />
            ))}
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
