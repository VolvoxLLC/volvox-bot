'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Check, Info, Shield, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type CellValue = true | false | string;

interface ComparisonRowData {
  readonly feature: string;
  readonly description: string;
  readonly volvox: CellValue;
  readonly mee6: CellValue;
  readonly dyno: CellValue;
  readonly carlbot: CellValue;
  readonly highlight?: boolean;
}

const comparisonData: readonly ComparisonRowData[] = [
  {
    feature: 'AI Neural Chat',
    description: 'Context-aware server conversations',
    volvox: true,
    mee6: false,
    dyno: false,
    carlbot: false,
    highlight: true,
  },
  {
    feature: 'AI Moderation',
    description: 'Autonomous Claude-powered logic',
    volvox: true,
    mee6: 'Basic',
    dyno: 'Basic',
    carlbot: 'Basic',
  },
  {
    feature: 'Next-Gen Dashboard',
    description: 'Fully reactive configuration UI',
    volvox: true,
    mee6: true,
    dyno: true,
    carlbot: 'Limited',
  },
  {
    feature: 'Global Analytics',
    description: 'Real-time server health metrics',
    volvox: true,
    mee6: 'Paid',
    dyno: false,
    carlbot: false,
  },
  {
    feature: 'Custom Branding',
    description: 'Personalize your bot presence',
    volvox: true,
    mee6: 'Premium',
    dyno: 'Premium',
    carlbot: true,
  },
  {
    feature: 'Access Model',
    description: 'Core functionality availability',
    volvox: 'Unlimited',
    mee6: 'Restricted',
    dyno: 'Restricted',
    carlbot: 'Restricted',
  },
];

function CellValueDisplay({ value, isVolvox }: Readonly<{ value: CellValue; isVolvox?: boolean }>) {
  if (value === true) {
    return (
      <div
        className={cn(
          'mx-auto flex h-6 w-6 items-center justify-center rounded-full',
          isVolvox ? 'bg-primary/20 text-primary' : 'bg-foreground/5 text-foreground/40',
        )}
      >
        <Check className="h-4 w-4 stroke-[3px]" />
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-foreground/[0.02] text-foreground/10">
        <X className="h-4 w-4 stroke-[3px]" />
      </div>
    );
  }
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-tighter',
        isVolvox ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
      )}
    >
      {value}
    </span>
  );
}

function ComparisonRow({
  row,
  index,
  shouldReduceMotion,
}: {
  row: ComparisonRowData;
  index: number;
  shouldReduceMotion: boolean;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const glowOpacity = useMotionValue(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const controls = animate(glowOpacity, isHovered ? 1 : 0, { duration: 0.3 });
    return () => controls.stop();
  }, [glowOpacity, isHovered]);

  const handleMouseMove = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (!rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const glowBg = useTransform(
    [mouseX, mouseY, glowOpacity],
    ([x, y, opacity]) =>
      `radial-gradient(600px circle at ${x}px ${y}px, hsl(var(--primary) / ${0.08 * (opacity as number)}), transparent 80%)`,
  );

  return (
    <motion.tr
      ref={rowRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.6,
        delay: shouldReduceMotion ? 0 : index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ backgroundImage: glowBg }}
      className={cn(
        'group border-b border-border/40 transition-all duration-500',
        row.highlight ? 'bg-primary/[0.02]' : 'hover:bg-foreground/[0.01]',
      )}
    >
      <th scope="row" className="relative px-6 py-3.5 text-left align-middle">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-black uppercase tracking-tight text-foreground transition-colors group-hover:text-primary">
            {row.feature}
          </span>
          <span className="text-[10px] font-medium leading-tight text-muted-foreground/60">
            {row.description}
          </span>
        </div>
        {row.highlight && (
          <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
        )}
      </th>
      <td className="h-full border-x border-primary/10 bg-primary/[0.03] px-3 py-3.5 text-center align-middle dark:bg-primary/[0.01]">
        <CellValueDisplay value={row.volvox} isVolvox />
      </td>
      <td className="px-3 py-3.5 text-center align-middle">
        <CellValueDisplay value={row.mee6} />
      </td>
      <td className="px-3 py-3.5 text-center align-middle">
        <CellValueDisplay value={row.dyno} />
      </td>
      <td className="px-3 py-3.5 text-center align-middle">
        <CellValueDisplay value={row.carlbot} />
      </td>
    </motion.tr>
  );
}

export function ComparisonTable() {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="relative overflow-hidden bg-background px-4 py-32 sm:px-6 lg:px-8">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
        <div className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,hsl(var(--primary))_0%,transparent_70%)] blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="mb-16 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-6 inline-flex items-center gap-3 rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 font-mono text-[9px] font-black uppercase tracking-[0.3em] text-secondary"
          >
            [BENCHMARK_ANALYSIS]
          </motion.div>

          <h2 className="mb-4 text-3xl font-black leading-[0.95] tracking-tighter text-foreground md:text-5xl">
            Engineered for <br />
            <span className="text-aurora">Superiority.</span>
          </h2>
          <p className="max-w-xl text-base font-light text-muted-foreground">
            Volvox isn't just another bot. It's a complete architectural overhaul of community
            governance.
          </p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card/30 shadow-xl backdrop-blur-3xl">
          <div className="overflow-x-auto scrollbar-none">
            <table
              // biome-ignore lint/a11y/noRedundantRoles: keep an explicit role so the E2E selector can target the comparison table consistently
              role="table"
              aria-label="Feature comparison"
              className="min-w-[700px] w-full table-fixed border-separate border-spacing-0"
            >
              <colgroup>
                <col className="w-[35%]" />
                <col className="w-[16.25%]" />
                <col className="w-[16.25%]" />
                <col className="w-[16.25%]" />
                <col className="w-[16.25%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-6 py-4 text-left font-mono text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    [SYSTEM_FEATURE]
                  </th>
                  <th className="border-x border-primary/20 bg-primary/10 px-3 py-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-[11px] font-black uppercase tracking-widest text-primary">
                        Volvox
                      </span>
                      <span className="font-mono text-[8px] font-bold text-primary/60">
                        V2.4_READY
                      </span>
                    </div>
                  </th>
                  <th className="px-3 py-4 text-center font-mono text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">
                    MEE6
                  </th>
                  <th className="px-3 py-4 text-center font-mono text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">
                    DYNO
                  </th>
                  <th className="px-3 py-4 text-center font-mono text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">
                    CARL-BOT
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, index) => (
                  <ComparisonRow
                    key={row.feature}
                    row={row}
                    index={index}
                    shouldReduceMotion={shouldReduceMotion}
                  />
                ))}
              </tbody>
            </table>

            <div className="flex min-w-[700px] items-center justify-between border-t border-border/40 bg-muted/10 px-6 py-4">
              <div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/30">
                <Info className="h-2.5 w-2.5" />
                Validated: {new Date().toLocaleDateString()}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-2.5 w-2.5 text-primary" />
                  <span className="font-mono text-[8px] font-black uppercase text-primary/40">
                    High_Speed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-2.5 w-2.5 text-secondary" />
                  <span className="font-mono text-[8px] font-black uppercase text-secondary/40">
                    Zero_Trust
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.4 }}
          className="mt-12 text-center font-mono text-[10px] font-bold uppercase tracking-[0.5em] text-muted-foreground"
        >
          SECURE_MATRIX_ENVIRONMENT [ENCRYPTED]
        </motion.div>
      </div>
    </section>
  );
}
