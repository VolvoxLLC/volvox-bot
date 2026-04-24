'use client';

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { Check, X } from 'lucide-react';
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
    description: 'Autonomous AI-powered logic',
    volvox: true,
    mee6: false,
    dyno: false,
    carlbot: false,
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
          isVolvox
            ? 'bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.1)]'
            : 'bg-foreground/5 text-foreground/50',
        )}
      >
        <Check className="h-[14px] w-[14px] stroke-[3px]" />
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-foreground/5 text-foreground/40">
        <X className="h-4 w-4 stroke-[2.5px]" />
      </div>
    );
  }
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest transition-colors',
        isVolvox
          ? 'bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.05)]'
          : 'bg-foreground/5 text-foreground/70',
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
      `radial-gradient(600px circle at ${x}px ${y}px, hsl(var(--foreground) / ${0.03 * (opacity as number)}), transparent 80%)`,
  );

  return (
    <motion.tr
      ref={rowRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{
        duration: 0.4,
        delay: shouldReduceMotion ? 0 : index * 0.05,
      }}
      style={{ backgroundImage: glowBg }}
      className={cn(
        'group border-b border-border/40 transition-colors duration-200',
        row.highlight ? 'bg-primary/[0.02]' : 'hover:bg-foreground/[0.01]',
      )}
    >
      <th scope="row" className="relative px-6 py-4 text-left align-middle font-normal">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold tracking-tight text-foreground/90">
            {row.feature}
          </span>
          <span className="text-[12px] font-medium text-foreground/40">{row.description}</span>
        </div>
        {row.highlight && (
          <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary/60" />
        )}
      </th>
      <td className="h-full border-x border-border/30 bg-background/50 px-3 py-4 text-center align-middle group-hover:bg-background">
        <CellValueDisplay value={row.volvox} isVolvox />
      </td>
      <td className="px-3 py-4 text-center align-middle">
        <CellValueDisplay value={row.mee6} />
      </td>
      <td className="px-3 py-4 text-center align-middle">
        <CellValueDisplay value={row.dyno} />
      </td>
      <td className="px-3 py-4 text-center align-middle">
        <CellValueDisplay value={row.carlbot} />
      </td>
    </motion.tr>
  );
}

export function ComparisonTable() {
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldReduceMotion = mounted ? (reducedMotion ?? false) : false;

  return (
    <section className="relative bg-background px-4 py-32 sm:px-6 lg:px-8">
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="mb-20 flex flex-col items-center text-center">
          <h2 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            Engineered for superiority
          </h2>
          <p className="max-w-xl text-lg font-medium text-foreground/50">
            Volvox isn't just another bot. It's a complete architectural overhaul of community
            governance.
          </p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-sm">
          <div className="overflow-x-auto scrollbar-none">
            <table
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
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-6 py-5 text-left font-sans text-[11px] font-bold uppercase tracking-widest text-foreground/40">
                    Feature
                  </th>
                  <th className="border-x border-border/30 bg-background/50 px-3 py-5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-sans text-[12px] font-bold uppercase tracking-widest text-foreground">
                        Volvox<span className="text-primary">.Bot</span>
                      </span>
                    </div>
                  </th>
                  <th className="px-3 py-5 text-center font-sans text-[11px] font-bold uppercase tracking-widest text-foreground/40">
                    MEE6
                  </th>
                  <th className="px-3 py-5 text-center font-sans text-[11px] font-bold uppercase tracking-widest text-foreground/40">
                    DYNO
                  </th>
                  <th className="px-3 py-5 text-center font-sans text-[11px] font-bold uppercase tracking-widest text-foreground/40">
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
          </div>
        </div>
      </div>
    </section>
  );
}
