'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MODERATION_POOL, shuffleAndPick, TIMESTAMP_POOL, type ModerationItem } from './bento-data';

const severityColors = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
} as const;

interface BentoModerationItem extends ModerationItem {
  timestamp: string;
}

/**
 * Moderation feed cell for the bento grid.
 * Randomly picks 3 moderation events from the pool on mount.
 * Top item's dot pulses to indicate recency.
 */
export function BentoModeration() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<BentoModerationItem[]>([]);

  useEffect(() => {
    setMounted(true);
    const picked = shuffleAndPick(MODERATION_POOL, 3);
    const timestamps = shuffleAndPick(TIMESTAMP_POOL, 2);
    setItems(picked.map((item, i) => ({
      ...item,
      timestamp: i === 0 ? 'just now' : timestamps[i - 1],
    })));
  }, []);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 h-full"
    >
      <div className="text-sm font-semibold text-foreground mb-3">Moderation</div>
      <div className="flex flex-col gap-2.5" suppressHydrationWarning>
        {mounted && items.map((item, i) => (
          <motion.div
            key={`${item.text}-${item.timestamp}`}
            className="flex items-center gap-2"
            initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : i * 0.08 }}
          >
            {i === 0 ? (
              <motion.div
                className={`w-1.5 h-1.5 rounded-full ${severityColors[item.severity]} shrink-0`}
                animate={shouldReduceMotion ? {} : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <div
                className={`w-1.5 h-1.5 rounded-full ${severityColors[item.severity]} shrink-0`}
              />
            )}
            <span className="text-xs text-foreground flex-1 truncate">{item.text}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{item.timestamp}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
