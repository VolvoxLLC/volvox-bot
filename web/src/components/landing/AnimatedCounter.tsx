'use client';

import { useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Formats a number into a human-readable abbreviated string.
 * @param n - The number to format
 * @returns Abbreviated string (e.g., 1.2M, 3.5K, or locale-formatted)
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface AnimatedCounterProps {
  readonly target: number;
  readonly duration?: number;
  readonly formatter?: (n: number) => string;
}

/**
 * Animates a number from 0 to a target value with eased progression.
 * Animation triggers when the element scrolls into view.
 * @param target - The target number to animate to
 * @param duration - Animation duration in seconds (default: 2)
 * @param formatter - Custom number formatter (default: formatNumber)
 */
export function AnimatedCounter({
  target,
  duration = 2,
  formatter = formatNumber,
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isInView) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(target);
      return;
    }

    let startTime: number | null = null;
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      const eased = 1 - (1 - progress) ** 3;
      setCount(Math.floor(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCount(target);
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

  return <span ref={ref}>{formatter(count)}</span>;
}
