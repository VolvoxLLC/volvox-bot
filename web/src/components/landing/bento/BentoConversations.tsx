'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { CONVERSATION_POOL, shuffleAndPick, TIMESTAMP_POOL, type ConversationItem } from './bento-data';

const avatarColorMap = {
  purple: 'bg-secondary/30 text-secondary',
  green: 'bg-primary/30 text-primary',
  orange: 'bg-accent/30 text-accent',
} as const;

interface BentoConversationItem extends ConversationItem {
  messages: number;
  tokens: string;
  timestamp: string;
}

/**
 * Conversations list cell for the bento grid.
 * Randomly picks 3 conversations with randomized token/message counts on mount.
 */
export function BentoConversations() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [items, setItems] = useState<BentoConversationItem[]>([]);

  useEffect(() => {
    const picked = shuffleAndPick(CONVERSATION_POOL, 3);
    const timestamps = shuffleAndPick(TIMESTAMP_POOL, 3);
    setItems(picked.map((item, i) => ({
      ...item,
      messages: Math.floor(4 + Math.random() * 14),
      tokens: `${(0.8 + Math.random() * 4).toFixed(1)}k`,
      timestamp: timestamps[i],
    })));
  }, []);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 h-full"
    >
      <div className="text-sm font-semibold text-foreground mb-3">Conversations</div>
      <div className="flex flex-col gap-3" suppressHydrationWarning>
        {items.map((item, i) => (
          <motion.div
            key={`${item.question}-${item.timestamp}`}
            className="flex items-center gap-2.5"
            initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : i * 0.08 }}
          >
            <div
              className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-semibold ${avatarColorMap[item.avatarColor]}`}
            >
              {item.initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{item.question}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {item.messages} messages · {item.tokens} tokens
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{item.timestamp}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
