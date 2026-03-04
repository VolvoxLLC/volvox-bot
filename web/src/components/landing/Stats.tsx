'use client';

import { motion, useInView } from 'framer-motion';
import { MessageSquare, Star, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function AnimatedCounter({ target, duration = 2 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView) return;

    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
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

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

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

export function Stats() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto" ref={containerRef}>
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20"
        >
          <div className="text-center p-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]">
            <Users className="w-8 h-8 mx-auto mb-4 text-[var(--accent-primary)]" />
            <div className="font-heading text-4xl font-bold text-[var(--text-primary)] mb-2">
              <AnimatedCounter target={2500} />+
            </div>
            <div className="text-[var(--text-secondary)]">Servers</div>
          </div>

          <div className="text-center p-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]">
            <MessageSquare className="w-8 h-8 mx-auto mb-4 text-[var(--accent-success)]" />
            <div className="font-heading text-4xl font-bold text-[var(--text-primary)] mb-2">
              <AnimatedCounter target={500000} />+
            </div>
            <div className="text-[var(--text-secondary)]">Messages/day</div>
          </div>

          <div className="text-center p-8 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)]">
            <Star className="w-8 h-8 mx-auto mb-4 text-[var(--accent-warning)]" />
            <div className="font-heading text-4xl font-bold text-[var(--text-primary)] mb-2">
              <AnimatedCounter target={1200} />
            </div>
            <div className="text-[var(--text-secondary)]">GitHub Stars</div>
          </div>
        </motion.div>

        {/* Testimonials */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <h2 className="font-heading text-3xl font-bold text-center text-[var(--text-primary)] mb-12">
            Loved by developers
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                className="p-6 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] relative"
              >
                <div className="text-4xl text-[var(--accent-primary)] opacity-30 absolute top-4 left-4 font-serif">
                  "
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
          transition={{ duration: 0.6, delay: 0.6 }}
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
