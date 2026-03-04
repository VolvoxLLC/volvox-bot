'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';

const tiers = [
  {
    name: '~/dev/null',
    price: { monthly: 0, annual: 0 },
    description: 'For side projects that might actually ship.',
    cta: 'git clone',
    features: [
      'Core bot features',
      '1 Discord server',
      'Community support',
      'Self-hosted option',
    ],
    popular: false,
  },
  {
    name: './configure',
    price: { monthly: 12, annual: 115 },
    description: 'For growing communities that ship.',
    cta: 'npm install',
    features: [
      'Everything in ~/dev/null',
      'Up to 3 servers',
      'AI chat (100 msgs/day)',
      'Analytics dashboard',
      'Email support',
      'Custom command aliases',
    ],
    popular: true,
  },
  {
    name: 'make install',
    price: { monthly: 49, annual: 470 },
    description: 'For communities that mean business.',
    cta: 'curl | bash',
    features: [
      'Everything in ./configure',
      'Unlimited servers',
      'Unlimited AI chat',
      'White-label options',
      'SLA guarantee (99.9%)',
      'Dedicated support',
      'Early access to features',
    ],
    popular: false,
  },
];

export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
      <div className="max-w-7xl mx-auto" ref={containerRef}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold font-mono text-[var(--text-primary)] mb-4">
            <span className="text-[var(--accent-success)]">&gt;</span> Choose your deployment
          </h2>
          <p className="text-lg text-[var(--text-secondary)] mb-8">
            From hobby projects to enterprise guilds.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm ${!isAnnual ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              role="switch"
              aria-checked={isAnnual}
              aria-label="Toggle annual billing"
              className="relative w-14 h-7 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] transition-colors"
            >
              <motion.div
                animate={{ x: isAnnual ? 28 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-5 h-5 rounded-full bg-[var(--accent-primary)]"
              />
            </button>
            <span className={`text-sm ${isAnnual ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              Annual <span className="text-[var(--accent-success)]">--save-dev</span>
            </span>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15, ease: [0.16, 1, 0.3, 1] }}
              className={`relative rounded-lg border ${
                tier.popular
                  ? 'border-[var(--accent-primary)] bg-[var(--bg-primary)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-primary)]'
              } p-6 flex flex-col`}
            >
              {/* Popular Badge */}
              {tier.popular && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--accent-primary)] text-white text-xs font-medium"
                >
                  ★ POPULAR
                </motion.div>
              )}

              {/* Header */}
              <div className="mb-6">
                <h3 className="text-xl font-bold font-mono text-[var(--text-primary)] mb-2">
                  {tier.name}
                </h3>
                <p className="text-sm text-[var(--text-muted)]">{tier.description}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <span className="text-4xl font-bold font-mono text-[var(--text-primary)]">
                  ${isAnnual ? tier.price.annual : tier.price.monthly}
                </span>
                <span className="text-[var(--text-muted)]">/{isAnnual ? 'year' : 'mo'}</span>
                {isAnnual && tier.price.monthly > 0 && (
                  <p className="text-sm text-[var(--accent-success)] mt-1">
                    Save ${tier.price.monthly * 12 - tier.price.annual}/year
                  </p>
                )}
              </div>

              {/* CTA */}
              <Button
                variant={tier.popular ? 'default' : 'outline'}
                className={`w-full mb-6 font-mono ${
                  tier.popular
                    ? 'bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90'
                    : ''
                }`}
                asChild
              >
                <a href={getBotInviteUrl() || '#'} target="_blank" rel="noopener noreferrer">
                  {tier.cta}
                </a>
              </Button>

              {/* Features */}
              <ul className="space-y-3 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[var(--accent-success)] shrink-0 mt-0.5" />
                    <span className="text-sm text-[var(--text-secondary)]">{feature}</span>
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
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center text-sm text-[var(--text-muted)] font-mono"
        >
          All plans include open-source self-hosting option. No credit card required for ~/dev/null.
        </motion.p>
      </div>
    </section>
  );
}
