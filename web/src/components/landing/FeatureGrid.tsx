'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, MessageSquare, Shield, Star } from 'lucide-react';
import { useRef } from 'react';
import { ScrollStage } from './ScrollStage';

interface Feature {
  readonly accentClassName: string;
  readonly description: string;
  readonly details: readonly string[];
  readonly icon: LucideIcon;
  readonly title: string;
}

const features: readonly Feature[] = [
  {
    accentClassName: 'border-primary/15 bg-primary/8 text-primary',
    icon: MessageSquare,
    title: 'AI Chat',
    description:
      'Reply in-channel with Claude instead of pushing members through canned slash command flows.',
    details: [
      'Mention @volvox directly in channel and keep the conversation moving.',
      'Carry context across follow-ups so answers stay useful instead of repetitive.',
    ],
  },
  {
    accentClassName: 'border-secondary/20 bg-secondary/10 text-secondary',
    icon: Shield,
    title: 'Moderation',
    description:
      'Let Claude-backed moderation step in early, before your team is cleaning up a pile of nonsense.',
    details: [
      'Catch spam, raids, and toxicity before they spread through the server.',
      'Tune the rules from the dashboard instead of babysitting raw logs.',
    ],
  },
  {
    accentClassName: 'border-accent/20 bg-accent/10 text-accent',
    icon: Star,
    title: 'Starboard',
    description:
      'Turn the best posts into a running highlight reel without making moderators curate it by hand.',
    details: [
      'Promote standout posts automatically once the community votes with reactions.',
      'Keep the good stuff visible after the channel moves on to the next hundred messages.',
    ],
  },
  {
    accentClassName: 'border-primary/12 bg-primary/6 text-primary',
    icon: BarChart3,
    title: 'Analytics',
    description:
      'See what changed in your server before it turns into guesswork or another moderation fire drill.',
    details: [
      'Track the health of your server from the dashboard instead of piecing it together manually.',
      'Watch activity, member trends, and AI usage in one place.',
    ],
  },
];

function FeatureItem({
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
  const cellClassName = [
    'px-6 py-6 sm:px-7 sm:py-7',
    index >= 2 ? 'border-t border-border/70' : '',
    index % 2 === 1 ? 'sm:border-l sm:border-border/70' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.li
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.45,
        delay: shouldReduceMotion ? 0 : index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cellClassName}
    >
      <article className="flex items-start gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${feature.accentClassName}`}
        >
          <feature.icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{feature.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>

          <div className="mt-4 border-t border-border/60 pt-4">
            {feature.details.map((detail, detailIndex) => (
              <p
                key={detail}
                className={`text-sm leading-6 text-foreground/88 ${detailIndex > 0 ? 'mt-2' : ''}`}
              >
                {detail}
              </p>
            ))}
          </div>
        </div>
      </article>
    </motion.li>
  );
}

export function FeatureGrid() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' }) ?? false;
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="border-y border-border/60 bg-[var(--bg-primary)] px-4 pb-24 pt-32 sm:px-6 lg:px-8 lg:pt-36">
      <div className="mx-auto max-w-6xl" ref={containerRef}>
        <ScrollStage className="grid gap-10 lg:grid-cols-[minmax(0,18rem)_1fr] lg:gap-14">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="max-w-md lg:self-center"
          >
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Everything you need
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">
              Run chat, moderation, highlights, and reporting without stitching together a stack of
              single-purpose bots.
            </p>
            <div className="mt-8 border-t border-border/60 pt-5">
              <p className="text-sm font-medium text-foreground">
                One bot in Discord. One dashboard in the browser.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The core workflows ship together, so setup stays short and your moderators stop
                bouncing between tools.
              </p>
            </div>
          </motion.div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/50">
            <ul className="grid sm:grid-cols-2" aria-label="Volvox feature set">
              {features.map((feature, index) => (
                <FeatureItem
                  key={feature.title}
                  feature={feature}
                  index={index}
                  isInView={isInView}
                  shouldReduceMotion={shouldReduceMotion}
                />
              ))}
            </ul>
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
