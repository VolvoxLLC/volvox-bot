'use client';

import { motion, useInView } from 'framer-motion';
import { Activity, ArrowRight, Shield, Terminal, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';
import { SectionHeader } from './SectionHeader';

const tiers = [
  {
    name: 'Standard',
    serial: 'MOD-01',
    price: { monthly: 0, annual: 0 },
    description: 'For side projects that might actually ship.',
    cta: 'INITIALIZE',
    href: null,
    features: [
      { name: 'Core bot features', enabled: true },
      { name: '1 Discord server', enabled: true },
      { name: 'Community support', enabled: true },
      { name: 'AI chat', enabled: false },
      { name: 'Analytics', enabled: false },
    ],
    popular: false,
    accent: 'primary',
  },
  {
    name: 'Overclocked',
    serial: 'ULT-99',
    price: { monthly: 14.99, annual: 115 },
    description: 'For growing communities that ship.',
    cta: 'OVERCLOCK NOW',
    href: null,
    features: [
      { name: 'Everything in Standard', enabled: true },
      { name: 'Up to 3 servers', enabled: true },
      { name: 'AI chat (100 msgs/day)', enabled: true },
      { name: 'Analytics dashboard', enabled: true },
      { name: 'Priority support', enabled: true },
    ],
    popular: true,
    accent: 'accent',
  },
];

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const botInviteUrl = getBotInviteUrl();

  const toggleBilling = () => setIsAnnual(!isAnnual);

  return (
    <section className="relative py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)] overflow-hidden">
      {/* Tactical Background elements — uses border color for subtle contrast */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10" ref={containerRef}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-14"
        >
          <SectionHeader
            label="QUOTA ARRANGEMENT"
            labelColor="primary"
            title="System Access Tiers"
            subtitle="Select the throughput required for your community architecture."
          />

          {/* Mechanical Toggle — refined for light/dark themes */}
          <div className="flex items-center justify-center gap-6 mt-12">
            <span
              className={`text-[10px] font-mono tracking-widest transition-colors ${!isAnnual ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
            >
              [MONTHLY_OPS]
            </span>

            <div
              role="button"
              tabIndex={0}
              aria-label="Toggle annual billing"
              className="relative w-24 h-11 bg-muted/40 dark:bg-black/40 rounded-xl p-1.5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.2)] border border-border cursor-pointer group"
              onClick={toggleBilling}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleBilling();
                }
              }}
            >
              {/* Rail */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-border/60 mx-3 rounded-full" />

              <motion.div
                animate={{ x: isAnnual ? 48 : 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="relative z-10 w-8 h-8 rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 border border-border shadow-[0_3px_10px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden"
              >
                {/* Knurled texture effect — tokenized for contrast */}
                <div
                  className="absolute inset-0 opacity-[0.05] dark:opacity-20 pointer-events-none"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, currentColor 25%, transparent 25%, transparent 50%, currentColor 50%, currentColor 75%, transparent 75%, transparent)',
                    backgroundSize: '4px 4px',
                  }}
                />
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-500 ${isAnnual ? 'bg-accent shadow-[0_0_12px_hsl(var(--accent))]' : 'bg-primary shadow-[0_0_12px_hsl(var(--primary))]'}`}
                />
              </motion.div>
            </div>

            <span
              className={`text-[10px] font-mono tracking-widest transition-colors ${isAnnual ? 'text-foreground animate-pulse' : 'text-muted-foreground'}`}
            >
              [ANNUAL_SAVE_36%]
            </span>
          </div>
        </motion.div>

        {/* Pricing Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="relative rounded-3xl p-[1px] overflow-hidden group"
            >
              {/* Animated gradient for Pro tier — strictly using primary/accent tokens */}
              {tier.popular && (
                <div className="absolute inset-0 bg-gradient-to-br from-accent/40 via-transparent to-primary/40 animate-pulse opacity-40 group-hover:opacity-100 transition-opacity" />
              )}

              <div className="relative bg-[var(--card)] rounded-[23px] h-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_12px_45px_-18px_rgba(0,0,0,0.5)] border border-border/60 dark:border-border/40 p-8 flex flex-col">
                {/* Visual refinement: Theme-aware corner labels */}
                <div className="absolute top-5 right-7 text-[9px] font-mono text-muted-foreground/30 tracking-[0.3em]">
                  {tier.serial}
                </div>

                <div className="mb-10">
                  <div className="flex items-center gap-3 mb-3">
                    {tier.popular ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                      >
                        <Zap className="w-5 h-5 text-accent" />
                      </motion.div>
                    ) : (
                      <Terminal className="w-5 h-5 text-primary" />
                    )}
                    <h3 className="text-sm font-mono font-bold tracking-[0.4em] uppercase text-foreground">
                      {tier.name}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground font-light leading-relaxed">
                    {tier.description}
                  </p>
                </div>

                {/* Price Display Widget — tokens for wells */}
                <div className="mb-10 p-7 rounded-2xl bg-muted/30 dark:bg-black/40 shadow-[inset_0_2px_10px_rgba(0,0,0,0.1)] border border-border/40 relative overflow-hidden">
                  <div className="flex items-baseline gap-2 relative z-10">
                    <span className="text-5xl font-black text-foreground tracking-tight">
                      ${isAnnual ? tier.price.annual : tier.price.monthly}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em] font-bold px-2.5 py-1 border border-border/80 rounded bg-background/50">
                      /{isAnnual ? 'year' : 'mo'}
                    </span>
                  </div>

                  {/* Layout Stability: Reserved height for Optimization Gain */}
                  <div className="mt-3 h-7 flex items-center overflow-hidden">
                    {isAnnual && tier.price.monthly > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[10px] font-mono text-accent font-bold uppercase tracking-tighter bg-accent text-accent-foreground px-2.5 py-1 rounded shadow-sm flex items-center gap-2"
                      >
                        <Shield className="w-3 h-3" />
                        Optimization Gain: $
                        {(tier.price.monthly * 12 - tier.price.annual).toFixed(2)}
                      </motion.div>
                    ) : null}
                  </div>

                  {/* Background data trace — tokens instead of white */}
                  <Activity className="absolute -bottom-3 -right-3 w-24 h-24 text-muted-foreground/[0.05]" />
                </div>

                {/* Functional Matrix List */}
                <div className="flex-1 space-y-4.5 mb-12">
                  <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-[0.3em] mb-5 font-bold">
                    [FUNCTIONAL_MATRIX]
                  </div>
                  {tier.features.map((feature) => (
                    <div key={feature.name} className="flex items-center gap-4">
                      <div
                        className={`w-2 h-2 rounded-sm rotate-45 transition-all duration-700 ${feature.enabled
                          ? tier.popular
                            ? 'bg-accent shadow-[0_0_12px_hsl(var(--accent)/0.8)]'
                            : 'bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)]'
                          : 'bg-muted-foreground/10'
                          }`}
                      />
                      <span
                        className={`text-[13px] font-mono tracking-tight transition-colors duration-300 ${feature.enabled ? 'text-foreground/80' : 'text-muted-foreground/30 line-through'}`}
                      >
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Modern Minimal Elegant CTA */}
                <Button
                  className={`group relative w-full h-14 rounded-xl font-bold text-[13px] tracking-wider uppercase transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]
                    ${tier.popular 
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90' 
                      : 'bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20'}
                  `}
                  asChild={!!(tier.href || botInviteUrl)}
                >
                   {(tier.href || botInviteUrl) ? (
                    <a href={(tier.href || botInviteUrl) ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                      <span>{tier.cta}</span>
                      <motion.div
                        className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </motion.div>
                    </a>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                       {tier.cta}
                    </span>
                  )}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* System Nodes Status — uses tokenized gradients */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 0.5 } : {}}
          transition={{ delay: 1 }}
          className="mt-20 flex items-center justify-center gap-12"
        >
          <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          <div className="text-[10px] font-mono uppercase tracking-[0.6em] text-muted-foreground font-bold">
            SECURE_SUBSCRIPTION_ENV [STABLE]
          </div>
          <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent via-border to-transparent" />
        </motion.div>
      </div>
    </section>
  );
}
