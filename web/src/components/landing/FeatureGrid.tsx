'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, MessageSquare, Shield, Star } from 'lucide-react';
import { useRef } from 'react';

const features: { icon: LucideIcon; title: string; description: string; color: string }[] = [
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description:
      'Mention @volvox to chat with Claude. Context-aware, helpful, and actually understands your community.',
    color: '#007aff',
  },
  {
    icon: Shield,
    title: 'Moderation',
    description:
      'Auto-mod with Claude intelligence. No more spam, raids, or toxicity slipping through.',
    color: '#af58da',
  },
  {
    icon: Star,
    title: 'Starboard',
    description: 'Highlight the best moments automatically. Your community curates itself.',
    color: '#ff9500',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Real-time dashboard with insights that matter. Know your community.',
    color: '#22c55e',
  },
];

function FeatureCard({ feature, index }: { feature: (typeof features)[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: shouldReduceMotion ? 0 : index * 0.12,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={shouldReduceMotion ? undefined : { y: -4, transition: { duration: 0.2 } }}
      className="group relative rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20"
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
        style={{ backgroundColor: `${feature.color}15` }}
      >
        <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
      </div>

      {/* Content */}
      <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">{feature.title}</h3>
      <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
    </motion.div>
  );
}

export function FeatureGrid() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="max-w-6xl mx-auto" ref={containerRef}>
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
            Everything you need
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Built by developers who actually use Discord. No bloat, no fluff.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
