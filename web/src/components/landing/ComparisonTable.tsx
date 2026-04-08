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
          'flex items-center justify-center w-6 h-6 rounded-full mx-auto',
          isVolvox ? 'bg-primary/20 text-primary' : 'bg-foreground/5 text-foreground/40',
        )}
      >
        <Check className="h-4 w-4 stroke-[3px]" />
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-center justify-center w-6 h-6 rounded-full mx-auto bg-foreground/[0.02] text-foreground/10">
        <X className="h-4 w-4 stroke-[3px]" />
      </div>
    );
  }
  return (
    <span
      className={cn(
        'text-[11px] font-mono font-bold uppercase tracking-tighter px-2 py-0.5 rounded-md',
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
  isInView: _isInView,
  shouldReduceMotion,
}: {
  row: ComparisonRowData;
  index: number;
  isInView: boolean;
  shouldReduceMotion: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const glowOpacity = useMotionValue(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const controls = animate(glowOpacity, isHovered ? 1 : 0, { duration: 0.3 });
    return () => controls.stop();
  }, [isHovered, glowOpacity]);

  const handleMouseMove = (e: React.MouseEvent) => {
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
    <motion.div
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
      className={cn(
        'group relative grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] border-b border-border/40 items-center transition-all duration-500 min-w-[700px]',
        row.highlight ? 'bg-primary/[0.02]' : 'hover:bg-foreground/[0.01]',
      )}
    >
      {/* Integrated Cursor Glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none -z-10"
        style={{ background: glowBg }}
      />

      {/* Feature Info */}
      <div className="px-6 py-3.5 relative">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-black tracking-tight text-foreground uppercase group-hover:text-primary transition-colors">
            {row.feature}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground/60 leading-tight">
            {row.description}
          </span>
        </div>
        {row.highlight && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
        )}
      </div>

      {/* Volvox Column */}
      <div className="px-3 py-3.5 text-center bg-primary/[0.03] dark:bg-primary/[0.01] h-full flex items-center justify-center border-x border-primary/10">
        <CellValueDisplay value={row.volvox} isVolvox />
      </div>

      {/* Competitors */}
      <div className="px-3 py-3.5 text-center h-full flex items-center justify-center">
        <CellValueDisplay value={row.mee6} />
      </div>
      <div className="px-3 py-3.5 text-center h-full flex items-center justify-center">
        <CellValueDisplay value={row.dyno} />
      </div>
      <div className="px-3 py-3.5 text-center h-full flex items-center justify-center">
        <CellValueDisplay value={row.carlbot} />
      </div>
    </motion.div>
  );
}

export function ComparisonTable() {
  const containerRef = useRef(null);
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <section className="relative py-32 px-4 sm:px-6 lg:px-8 bg-background overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsl(var(--primary))_0%,transparent_70%)] blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10" ref={containerRef}>
        <div className="flex flex-col items-center text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-6 inline-flex items-center gap-3 rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-[9px] font-mono font-black tracking-[0.3em] text-secondary uppercase"
          >
            [BENCHMARK_ANALYSIS]
          </motion.div>

          <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-foreground mb-4 leading-[0.95]">
            Engineered for <br />
            <span className="text-aurora">Superiority.</span>
          </h2>
          <p className="text-base text-muted-foreground max-w-xl font-light">
            Volvox isn't just another bot. It's a complete architectural overhaul of community
            governance.
          </p>
        </div>

        {/* Matrix Container */}
        <div className="rounded-[2rem] border border-border/60 bg-card/30 backdrop-blur-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto scrollbar-none">
            {/* Header Row */}
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] bg-muted/30 border-b border-border min-w-[700px]">
              <div className="px-6 py-4 text-[10px] font-mono font-black tracking-[0.2em] text-muted-foreground uppercase">
                [SYSTEM_FEATURE]
              </div>
              <div className="px-3 py-4 text-center border-x border-primary/20 bg-primary/10">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[11px] font-mono font-black tracking-widest text-primary uppercase">
                    Volvox
                  </span>
                  <span className="text-[8px] font-mono font-bold text-primary/60">V2.4_READY</span>
                </div>
              </div>
              <div className="px-3 py-4 text-center text-[9px] font-mono font-black tracking-widest text-muted-foreground/30 uppercase flex items-center justify-center">
                MEE6
              </div>
              <div className="px-3 py-4 text-center text-[9px] font-mono font-black tracking-widest text-muted-foreground/30 uppercase flex items-center justify-center">
                DYNO
              </div>
              <div className="px-3 py-4 text-center text-[9px] font-mono font-black tracking-widest text-muted-foreground/30 uppercase flex items-center justify-center">
                CARL-BOT
              </div>
            </div>

            {/* Rows */}
            <div className="flex flex-col">
              {comparisonData.map((row, index) => (
                <ComparisonRow
                  key={row.feature}
                  row={row}
                  index={index}
                  isInView={true}
                  shouldReduceMotion={shouldReduceMotion}
                />
              ))}
            </div>

            {/* Matrix Footer */}
            <div className="px-6 py-4 bg-muted/10 border-t border-border/40 flex items-center justify-between min-w-[700px]">
              <div className="flex items-center gap-3 text-[8px] font-mono text-muted-foreground/30 uppercase tracking-[0.2em]">
                <Info className="w-2.5 h-2.5" />
                Validated: {new Date().toLocaleDateString()}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-2.5 h-2.5 text-primary" />
                  <span className="text-[8px] font-mono font-black text-primary/40 uppercase">
                    High_Speed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-2.5 h-2.5 text-secondary" />
                  <span className="text-[8px] font-mono font-black text-secondary/40 uppercase">
                    Zero_Trust
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tactical Footnote */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.4 }}
          className="mt-12 text-center text-[10px] font-mono uppercase tracking-[0.5em] text-muted-foreground font-bold"
        >
          SECURE_MATRIX_ENVIRONMENT [ENCRYPTED]
        </motion.div>
      </div>
    </section>
  );
}
