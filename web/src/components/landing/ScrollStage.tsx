'use client';

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';
import { useRef } from 'react';

interface ScrollStageProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly enterOffset?: number;
  readonly exitOffset?: number;
}

const stageSpring = {
  damping: 28,
  mass: 0.35,
  stiffness: 180,
};

export function ScrollStage({
  children,
  className,
  enterOffset = 40,
  exitOffset = 18,
}: ScrollStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ['start 0.92', 'end 0.1'],
  });

  const rawY = useTransform(scrollYProgress, [0, 0.3, 1], [enterOffset, 0, -exitOffset]);
  const rawOpacity = useTransform(scrollYProgress, [0, 0.16, 0.88, 1], [0.72, 1, 1, 0.92]);
  const rawScale = useTransform(scrollYProgress, [0, 0.18, 1], [0.986, 1, 0.992]);

  const y = useSpring(rawY, stageSpring);
  const opacity = useSpring(rawOpacity, { ...stageSpring, damping: 30, stiffness: 170 });
  const scale = useSpring(rawScale, { ...stageSpring, damping: 32, stiffness: 190 });

  return (
    <motion.div
      ref={stageRef}
      className={className}
      style={shouldReduceMotion ? undefined : { opacity, scale, y }}
    >
      {children}
    </motion.div>
  );
}
