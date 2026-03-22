'use client';

import { motion, useInView } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';
import { SectionHeader } from './SectionHeader';
import { ScrollStage } from './ScrollStage';

const GITHUB_REPO_URL = 'https://github.com/VolvoxLLC/volvox-bot';

const tiers = [
  {
    name: 'Free',
    price: { monthly: 0, annual: 0 },
    description: 'For side projects that might actually ship.',
    cta: 'Get Started',
    href: GITHUB_REPO_URL,
    features: ['Core bot features', '1 Discord server', 'Community support', 'Self-hosted option'],
    popular: false,
    cardClassName: 'border border-border',
    badgeClassName: '',
    buttonClassName: 'border-secondary/20 text-secondary hover:bg-secondary/8 hover:text-secondary',
    checkClassName: 'text-primary',
    noteClassName: 'text-primary',
  },
  {
    name: 'Pro',
    price: { monthly: 14.99, annual: 115 },
    description: 'For growing communities that ship.',
    cta: 'Start Free Trial',
    href: null,
    features: [
      'Everything in Free',
      'Up to 3 servers',
      'AI chat (100 msgs/day)',
      'Analytics dashboard',
      'Email support',
      'Custom command aliases',
    ],
    popular: true,
    cardClassName: 'border-2 border-accent shadow-lg shadow-accent/12',
    badgeClassName: 'bg-accent text-accent-foreground',
    buttonClassName:
      'bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/25',
    checkClassName: 'text-accent',
    noteClassName: 'text-accent',
  },
];

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const botInviteUrl = getBotInviteUrl();

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto" ref={containerRef}>
        <ScrollStage>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="mb-14"
          >
            <SectionHeader
              label="PRICING"
              labelColor="primary"
              title="Simple, transparent pricing"
              subtitle="Start free. Upgrade when your community grows."
            />

            {/* Toggle */}
            <div className="flex items-center justify-center gap-4 mt-10">
              <span
                className={`text-sm font-medium transition-colors ${
                  isAnnual ? 'text-muted-foreground' : 'text-foreground'
                }`}
              >
                Monthly
              </span>
              <button
                type="button"
                onClick={() => setIsAnnual(!isAnnual)}
                role="switch"
                aria-checked={isAnnual}
                aria-label="Toggle annual billing"
                className={`relative h-7 w-14 rounded-full border transition-colors ${
                  isAnnual ? 'border-accent/25 bg-accent/10' : 'border-secondary/20 bg-secondary/10'
                }`}
              >
                <motion.div
                  animate={{ x: isAnnual ? 28 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className={`absolute top-1 h-5 w-5 rounded-full ${isAnnual ? 'bg-accent' : 'bg-secondary'}`}
                />
              </button>
              <span
                className={`text-sm font-medium transition-colors ${
                  isAnnual ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                Annual <span className="text-accent font-bold">Save 36%</span>
              </span>
            </div>
          </motion.div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
            {tiers.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className={`relative rounded-2xl bg-card p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${tier.cardClassName}`}
              >
                {/* Popular Badge */}
                {tier.popular && (
                  <div
                    className={`absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${tier.badgeClassName}`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Most Popular
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-foreground mb-2">{tier.name}</h3>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                </div>

                {/* Price */}
                <div className="mb-8">
                  <span className="text-5xl font-extrabold text-foreground tracking-tight">
                    ${isAnnual ? tier.price.annual : tier.price.monthly}
                  </span>
                  <span className="text-muted-foreground ml-1">/{isAnnual ? 'year' : 'mo'}</span>
                  {isAnnual && tier.price.monthly > 0 && (
                    <p className={`mt-1 text-sm font-semibold ${tier.noteClassName}`}>
                      Save ${(tier.price.monthly * 12 - tier.price.annual).toFixed(2)}/year
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Button
                  variant={tier.popular ? 'default' : 'outline'}
                  className={`w-full mb-8 rounded-full h-12 font-bold text-sm tracking-wider uppercase hover:scale-[1.02] transition-transform ${tier.buttonClassName} ${!tier.href && !botInviteUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                  asChild={!!(tier.href || botInviteUrl)}
                  disabled={!tier.href && !botInviteUrl}
                >
                  {tier.href ? (
                    <a href={tier.href} target="_blank" rel="noopener noreferrer">
                      {tier.cta}
                    </a>
                  ) : botInviteUrl ? (
                    <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
                      {tier.cta}
                    </a>
                  ) : (
                    <span>{tier.cta}</span>
                  )}
                </Button>

                {/* Features */}
                <ul className="space-y-3.5 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 shrink-0 mt-0.5 ${tier.checkClassName}`} />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          {/* Footer Note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center text-sm text-muted-foreground"
          >
            All plans include open-source self-hosting option. No credit card required for Free.
          </motion.p>
        </ScrollStage>
      </div>
    </section>
  );
}
