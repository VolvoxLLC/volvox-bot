'use client';

import { motion } from 'framer-motion';
import { Check, Shield, Terminal, X, Zap } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { getBotInviteUrl } from '@/lib/discord';
import { cn } from '@/lib/utils';

// ─── Primitive Components provided by user ──────────────────────

function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-card relative w-full rounded-[2rem] dark:bg-card flex flex-col',
        'p-1.5 shadow-xl backdrop-blur-xl',
        'border border-border/60 hover:border-primary/30 transition-all duration-500',
        'hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1',
        className,
      )}
      {...props}
    />
  );
}

function Header({
  className,
  children,
  glassEffect = true,
  ...props
}: ComponentProps<'div'> & {
  glassEffect?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-muted/30 dark:bg-background/40 relative mb-2 rounded-[1.5rem] border border-border/40 p-6 flex-shrink-0',
        'shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden',
        className,
      )}
      {...props}
    >
      {/* Top glass gradient */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--primary) / 5%) 0%, transparent 100%)',
        }}
      />
      {glassEffect && (
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 h-48 w-48 bg-primary/10 blur-[80px] rounded-full pointer-events-none"
        />
      )}
      {children}
    </div>
  );
}

function Plan({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-4', className)} {...props} />
  );
}

function Description({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-foreground/50 text-sm font-medium', className)} {...props} />;
}

function PlanName({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'text-foreground flex items-center gap-2 text-lg font-bold tracking-tight',
        className,
      )}
      {...props}
    />
  );
}

function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'border-primary/30 bg-primary/10 text-primary font-bold tracking-wider uppercase rounded-full border px-3 py-1 text-[10px]',
        'shadow-[0_0_15px_hsl(var(--primary)/0.1)]',
        className,
      )}
      {...props}
    />
  );
}

function Price({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-2 flex items-baseline gap-1.5', className)} {...props} />;
}

function MainPrice({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-5xl font-black tracking-tighter text-foreground', className)}
      {...props}
    />
  );
}

function Period({ className, ...props }: ComponentProps<typeof motion.span>) {
  return (
    <motion.span
      layout
      className={cn(
        'text-foreground/40 font-bold uppercase tracking-widest text-[11px]',
        className,
      )}
      {...props}
    />
  );
}

function OriginalPrice({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'text-foreground/30 mr-2 text-xl font-bold line-through relative top-[-2px]',
        className,
      )}
      {...props}
    />
  );
}

function Body({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('space-y-6 p-6 flex flex-col flex-1', className)} {...props} />;
}

function List({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('space-y-4 mb-8', className)} {...props} />;
}

function ListItem({ className, children, ...props }: ComponentProps<'li'>) {
  return (
    <li
      className={cn(
        'text-foreground/70 font-medium flex items-center gap-3 text-[14px]',
        className,
      )}
      {...props}
    >
      {children}
    </li>
  );
}

// ─── Main Section ──────────────────────────────────────────────

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const botInviteUrl = getBotInviteUrl();

  const toggleBilling = () => setIsAnnual((prev) => !prev);

  return (
    <section className="relative px-4 py-32 w-full min-h-screen mx-auto bg-background overflow-hidden">
      {/* Prismatic Shards Background */}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="max-w-6xl mx-auto relative z-10 flex flex-col items-center"
      >
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="flex items-center justify-center gap-3 mb-6 opacity-80"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/40">
              SYSTEM ACCESS TIERS
            </span>
          </motion.div>

          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6 leading-tight tracking-tight">
            Pricing
          </h2>
          <p className="text-lg text-foreground/50 max-w-xl mx-auto font-medium leading-relaxed mb-10">
            Start with the core bot for free, then upgrade when your server needs deeper
            automation, analytics, and support.
          </p>

          <div className="flex items-center justify-center gap-6 mb-4">
            <span
              className={cn(
                'text-[11px] font-mono tracking-widest font-bold transition-all duration-300',
                isAnnual ? 'text-foreground/20 scale-100' : 'text-primary scale-110',
              )}
            >
              MONTHLY
            </span>
            <button
              type="button"
              aria-label="Toggle annual billing"
              aria-pressed={isAnnual}
              className="relative w-14 h-8 bg-card border border-border/80 rounded-full p-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ring-offset-background transition-all group"
              onClick={toggleBilling}
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <motion.div
                animate={{ x: isAnnual ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="relative w-6 h-6 rounded-full bg-primary shadow-[0_0_15px_hsl(var(--primary)/0.3)] z-10"
              />
            </button>
            <span
              className={cn(
                'text-[11px] font-mono tracking-widest font-bold transition-all duration-300',
                isAnnual ? 'text-primary scale-110' : 'text-foreground/20 scale-100',
              )}
            >
              ANNUAL
            </span>
          </div>
          <div className="h-6">
            {isAnnual && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] font-black text-primary underline decoration-primary/30 underline-offset-4 tracking-[0.2em] uppercase"
              >
                Save up to 35% Yearly
              </motion.div>
            )}
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative">
          {/* Back-glow for Overclocked */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 h-full bg-primary/20 blur-[120px] pointer-events-none opacity-20 sm:opacity-30" />
          {/* Card: Standard */}
          <Card className="max-w-none">
            <Header glassEffect={false}>
              <Plan>
                <PlanName>
                  <Terminal className="w-5 h-5 text-foreground/40" />
                  Standard
                </PlanName>
              </Plan>
              <Description>For side projects that might actually ship.</Description>

              <div className="mt-8">
                <Price>
                  <MainPrice>$0</MainPrice>
                  <Period>/{isAnnual ? 'year' : 'mo'}</Period>
                </Price>
                <div className="h-5 flex items-center">
                  {/* Empty placeholder to align height with overclocked savings */}
                </div>
              </div>
            </Header>

            <Body>
              <List className="stagger-fade-in">
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  Core command modules
                </ListItem>
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  Basic configuration dashboard
                </ListItem>
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  Standard execution priority
                </ListItem>
                <ListItem className="opacity-40 grayscale">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground/40">
                    <X className="h-3 w-3" />
                  </div>
                  AI setup and moderation
                </ListItem>
                <ListItem className="opacity-40 grayscale">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-foreground/40">
                    <X className="h-3 w-3" />
                  </div>
                  Real-time Dashboard Analytics
                </ListItem>
              </List>

              <div className="mt-auto pt-4">
                {botInviteUrl ? (
                  <a
                    href={botInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-14 rounded-xl bg-muted/60 text-foreground font-bold tracking-widest text-xs uppercase hover:bg-muted transition-colors border border-border"
                  >
                    INITIALIZE STANDARD
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex items-center justify-center h-14 rounded-xl bg-muted/60 text-foreground font-bold tracking-widest text-xs uppercase transition-colors border border-border opacity-60 cursor-not-allowed"
                  >
                    INITIALIZE STANDARD
                  </button>
                )}
              </div>
            </Body>
          </Card>

          {/* Card: Overclocked */}
          <Card className="max-w-none border-primary/40 relative overflow-hidden bg-background group/card">
            {/* Animated Gradient Border Layer */}
            <div className="absolute inset-0 p-[2px] rounded-[inherit] pointer-events-none">
              <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-primary/40 via-transparent to-primary/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700" />
            </div>

            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
            <Header glassEffect={true} className="border-primary/20 bg-primary/5">
              <Plan>
                <PlanName>
                  <Zap className="w-5 h-5 text-primary" />
                  Overclocked
                </PlanName>
                <Badge>Recommended</Badge>
              </Plan>
              <Description>Unlock advanced automation, analytics, and priority support.</Description>

              <div className="mt-8">
                <Price>
                  {isAnnual && <OriginalPrice>$14.99</OriginalPrice>}
                  <MainPrice>${isAnnual ? '115' : '14.99'}</MainPrice>
                  <Period>/{isAnnual ? 'year' : 'mo'}</Period>
                </Price>

                <div className="h-5 flex items-center">
                  {isAnnual ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[11px] font-bold tracking-tight text-primary flex items-center gap-1.5"
                    >
                      <Shield className="w-3 h-3" />
                      Save ${(14.99 * 12 - 115).toFixed(2)}
                    </motion.div>
                  ) : null}
                </div>
              </div>
            </Header>

            <Body>
              <List className="stagger-fade-in">
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.2)]">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  All Standard bot features
                </ListItem>
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.2)]">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  AI setup and moderation
                </ListItem>
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.2)]">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  Real-time Dashboard Analytics
                </ListItem>
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.2)]">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  Prioritized Command Execution
                </ListItem>
                <ListItem>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_10px_hsl(var(--primary)/0.2)]">
                    <Check className="h-3 w-3 stroke-[3px]" />
                  </div>
                  Priority Technical Support
                </ListItem>
              </List>

              <div className="mt-auto pt-4 relative z-10">
                {botInviteUrl ? (
                  <a
                    href={botInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-background text-sm font-bold tracking-wide uppercase h-14 w-full rounded-xl bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.2)] hover:bg-primary/90 transition-all active:scale-[0.98]"
                  >
                    <Shield className="w-4 h-4 opacity-80" />
                    DEPLOY OVERCLOCKED
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex items-center justify-center gap-2 text-background text-sm font-bold tracking-wide uppercase h-14 w-full rounded-xl bg-muted/60 text-foreground transition-colors border border-border opacity-60 cursor-not-allowed"
                  >
                    <Shield className="w-4 h-4 opacity-40 shrink-0" />
                    DEPLOY OVERCLOCKED
                  </button>
                )}
              </div>
            </Body>
          </Card>
        </div>
      </motion.div>
    </section>
  );
}
