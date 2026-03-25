'use client';

import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AI_CHAT_POOL, pickRandom } from './bento-data';

/**
 * AI Chat cell for the bento grid.
 * Shows a random Q&A pair with a typing indicator that resolves into the bot's response.
 * Spans 2 columns on desktop.
 */
export function BentoAIChat() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [showResponse, setShowResponse] = useState(false);

  const chat = useMemo(() => pickRandom(AI_CHAT_POOL), []);

  // If user prefers reduced motion, skip typing animation entirely
  useEffect(() => {
    if (shouldReduceMotion) setShowResponse(true);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (!isInView || shouldReduceMotion || showResponse) return;
    const timer = setTimeout(() => setShowResponse(true), 1200);
    return () => clearTimeout(timer);
  }, [isInView, shouldReduceMotion, showResponse]);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 col-span-1 sm:col-span-2"
    >
      <div className="text-sm font-semibold text-foreground mb-3">AI Chat</div>
      <div className="flex flex-col gap-2.5">
        <motion.div
          className="flex gap-2 items-start"
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4 }}
        >
          <div className="w-5 h-5 rounded-full bg-secondary shrink-0 flex items-center justify-center text-[9px] font-bold text-white">
            A
          </div>
          <div className="bg-muted/50 rounded-lg px-3 py-1.5 text-xs text-foreground">
            {chat.question}
          </div>
        </motion.div>

        <motion.div
          className="flex gap-2 items-start justify-end"
          initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.4, delay: shouldReduceMotion ? 0 : 0.3 }}
        >
          <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-xs text-primary">
            <AnimatePresence mode="wait">
              {showResponse ? (
                <motion.span
                  key="response"
                  initial={shouldReduceMotion ? {} : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {chat.answer}
                </motion.span>
              ) : (
                <motion.span
                  key="typing"
                  className="inline-flex gap-1 py-0.5"
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1 h-1 rounded-full bg-primary"
                      animate={{ y: [0, -3, 0] }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.12,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="w-5 h-5 rounded-full bg-primary shrink-0 flex items-center justify-center text-[9px] font-bold text-white">
            V
          </div>
        </motion.div>
      </div>
    </div>
  );
}
