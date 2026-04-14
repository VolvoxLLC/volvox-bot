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
        'border border-border/60 hover:border-border transition-colors',
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
        className,
      )}
      {...props}
    >
      {/* Top glass gradient */}
      {glassEffect && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-48 rounded-[inherit] pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, hsl(var(--primary)/2%) 0%, transparent 100%)',
          }}
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
        'border-primary/20 bg-primary/10 text-primary font-bold tracking-wider uppercase rounded-full border px-3 py-1 text-[10px]',
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

function Period({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
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

function ListItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      className={cn(
        'text-foreground/70 font-medium flex items-center gap-3 text-[14px]',
        className,
      )}
      {...props}
    />
  );
}

// ─── Main Section ──────────────────────────────────────────────

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const botInviteUrl = getBotInviteUrl();

  const toggleBilling = () => setIsAnnual((prev) => !prev);

  return (
    <section className="relative px-4 py-32 w-full min-h-screen mx-auto bg-background border-t border-border/30">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 hidden md:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,hsl(var(--primary)/0.15)_0%,transparent_50%)]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10 flex flex-col items-center">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6 opacity-80">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/40">
              QUOTA ARRANGEMENT
            </span>
          </div>

          <h2 className="text-4xl md:text-5xl font-black text-foreground mb-6 leading-tight tracking-tight">
            System Access Tiers
          </h2>
          <p className="text-lg text-foreground/50 max-w-xl mx-auto font-medium leading-relaxed mb-10">
            Scale without limits. Establish perfect governance and save compounding hours in
            community management.
          </p>

          <div className="flex items-center justify-center gap-6">
            <span
              className={cn(
                'text-[11px] font-mono tracking-widest font-bold transition-colors',
                !isAnnual ? 'text-primary' : 'text-foreground/30',
              )}
            >
              MONTHLY
            </span>
            <button
              type="button"
              aria-label="Toggle annual billing"
              aria-pressed={isAnnual}
              className="relative w-14 h-8 bg-card border border-border/80 rounded-full p-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary ring-offset-background transition-all"
              onClick={toggleBilling}
            >
              <motion.div
                animate={{ x: isAnnual ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="w-6 h-6 rounded-full bg-primary shadow-sm"
              />
            </button>
            <span
              className={cn(
                'text-[11px] font-mono tracking-widest font-bold transition-colors',
                isAnnual ? 'text-primary' : 'text-foreground/30',
              )}
            >
              ANNUAL
            </span>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          {/* Card: Standard */}
          <Card className="max-w-none">
            <Header glassEffect={false}>
              <Plan>
                <PlanName>
                  <Terminal className="w-5 h-5 text-foreground/40" />
                  Standard
                </PlanName>
                <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-foreground/20 uppercase">
                  MOD-01
                </span>
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
              <List>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  Core command modules
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />1 Discord server
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  Basic configuration dashboard
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  Standard execution priority
                </ListItem>
                <ListItem className="opacity-50">
                  <X className="w-4 h-4 text-foreground/40 shrink-0" />
                  AI setup and moderation
                </ListItem>
                <ListItem className="opacity-50">
                  <X className="w-4 h-4 text-foreground/40 shrink-0" />
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
                  <div
                    aria-disabled="true"
                    className="flex items-center justify-center h-14 rounded-xl bg-muted/60 text-foreground font-bold tracking-widest text-xs uppercase transition-colors border border-border opacity-60 cursor-not-allowed"
                  >
                    INITIALIZE STANDARD
                  </div>
                )}
              </div>
            </Body>
          </Card>

          {/* Card: Overclocked */}
          <Card className="max-w-none border-primary/20 relative overflow-hidden bg-background">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
            <Header glassEffect={true} className="border-primary/20 bg-primary/5">
              <Plan>
                <PlanName>
                  <Zap className="w-5 h-5 text-primary" />
                  Overclocked
                </PlanName>
                <Badge>Recommended</Badge>
              </Plan>
              <Description>Deploy the absolute synthesis of AI intelligence.</Description>

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
              <List>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  All Standard bot features
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  Up to 3 Discord servers
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  AI setup and moderation
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  Real-time Dashboard Analytics
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  Prioritized Command Execution
                </ListItem>
                <ListItem>
                  <Check className="w-4 h-4 text-primary shrink-0" />
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
      </div>
    </section>
  );
}
