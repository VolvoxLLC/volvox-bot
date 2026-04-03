'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useRef } from 'react';
import { ScrollStage } from './ScrollStage';
import { SectionHeader } from './SectionHeader';

type CellValue = true | false | string;

interface ComparisonRow {
  readonly feature: string;
  readonly description: string;
  readonly volvox: CellValue;
  readonly mee6: CellValue;
  readonly dyno: CellValue;
  readonly carlbot: CellValue;
  readonly highlight?: boolean;
}

const comparisonData: readonly ComparisonRow[] = [
  {
    feature: 'AI Chat',
    description: 'Context-aware conversations',
    volvox: true,
    mee6: false,
    dyno: false,
    carlbot: false,
    highlight: false,
  },
  {
    feature: 'AI Moderation',
    description: 'Claude-powered',
    volvox: true,
    mee6: 'Basic',
    dyno: 'Basic',
    carlbot: 'Basic',
  },
  {
    feature: 'Web Dashboard',
    description: 'Full config UI',
    volvox: true,
    mee6: true,
    dyno: true,
    carlbot: 'Limited',
  },
  {
    feature: 'Starboard',
    description: 'Community highlights',
    volvox: true,
    mee6: false,
    dyno: false,
    carlbot: true,
  },
  {
    feature: 'Analytics',
    description: 'Server health metrics',
    volvox: true,
    mee6: 'Paid',
    dyno: false,
    carlbot: false,
  },
  {
    feature: 'Free Tier',
    description: 'What you get for free',
    volvox: 'Full features',
    mee6: 'Very limited',
    dyno: 'Limited',
    carlbot: 'Limited',
  },
];

/**
 * Renders a single comparison cell value as a checkmark, X, or text label.
 */
function CellContent({ value }: { readonly value: CellValue }) {
  if (value === true) {
    return <Check className="h-5 w-5 text-primary mx-auto" aria-label="Yes" />;
  }
  if (value === false) {
    return <X className="h-5 w-5 text-muted-foreground/20 mx-auto" aria-label="No" />;
  }
  return <span className="text-muted-foreground text-xs">{value}</span>;
}

/**
 * Feature comparison table pitting Volvox against MEE6, Dyno, and Carl-bot.
 * Rows where Volvox uniquely wins are tinted with a primary accent.
 */
export function ComparisonTable() {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
      <div className="max-w-5xl mx-auto" ref={containerRef}>
        <ScrollStage>
          <SectionHeader
            label="WHY VOLVOX"
            labelColor="secondary"
            title="Compare the alternatives"
            subtitle="See what you get with each bot. No hidden gotchas."
            className="mb-14"
          />

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[540px] w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 bg-card z-10 px-5 py-4 text-left text-sm font-medium text-muted-foreground">
                      Feature
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-primary">
                      <span className="inline-block rounded-full bg-primary/10 px-3 py-1">
                        Volvox
                      </span>
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                      MEE6
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                      Dyno
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-foreground">
                      Carl-bot
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row, index) => (
                    <motion.tr
                      key={row.feature}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{
                        duration: 0.4,
                        delay: shouldReduceMotion ? 0 : index * 0.04,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className={`border-b border-border/60 last:border-b-0 ${
                        row.highlight ? 'bg-primary/[0.03]' : ''
                      }`}
                    >
                      <td className="sticky left-0 bg-card z-10 px-5 py-4">
                        <div className="text-sm font-medium text-foreground">{row.feature}</div>
                        <div className="text-xs text-muted-foreground">{row.description}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <CellContent value={row.volvox} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <CellContent value={row.mee6} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <CellContent value={row.dyno} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <CellContent value={row.carlbot} />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollStage>
      </div>
    </section>
  );
}
