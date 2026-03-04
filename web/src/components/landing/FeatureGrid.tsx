'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { BarChart3, MessageSquare, Shield, Star } from 'lucide-react';
import { useRef } from 'react';

const features = [
  {
    icon: MessageSquare,
    title: 'AI Chat',
    description:
      'Mention @volvox to chat with Claude. Context-aware, helpful, and actually understands your community.',
    command: '$ ai --model claude',
  },
  {
    icon: Shield,
    title: 'Moderation',
    description:
      'Auto-mod with Claude intelligence. No more spam, raids, or toxicity slipping through.',
    command: '$ mod --auto-enable',
  },
  {
    icon: Star,
    title: 'Starboard',
    description: 'Highlight the best moments automatically. Your community curates itself.',
    command: '$ starboard --threshold 5',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Real-time dashboard with insights that matter. Know your community.',
    command: '$ analytics --export',
  },
];

function TerminalCard({ feature, index }: { feature: (typeof features)[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 30, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{
        duration: 0.5,
        delay: shouldReduceMotion ? 0 : index * 0.15,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={shouldReduceMotion ? undefined : { y: -4, transition: { duration: 0.2 } }}
      className="group relative rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] overflow-hidden hover:border-[var(--accent-primary)] transition-colors"
    >
      {/* Terminal Chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)] bg-[var(--bg-tertiary)]">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-xs text-[var(--text-muted)] font-mono">{feature.command}</span>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-[var(--accent-primary)]/10">
            <feature.icon className="w-6 h-6 text-[var(--accent-primary)]" />
          </div>
          <h3 className="font-heading text-xl font-bold text-[var(--text-primary)]">
            {feature.title}
          </h3>
        </div>
        <p className="text-[var(--text-secondary)] leading-relaxed">{feature.description}</p>
      </div>

      {/* Hover Glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--accent-primary)]/5 to-transparent" />
      </div>
    </motion.div>
  );
}

export function FeatureGrid() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[var(--bg-primary)]">
      <div className="max-w-7xl mx-auto" ref={containerRef}>
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-4">
            <span className="text-[var(--accent-success)]">&gt;</span> Features
          </h2>
          <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            Everything you need, nothing you don't. Built by developers who actually use Discord.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <TerminalCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
