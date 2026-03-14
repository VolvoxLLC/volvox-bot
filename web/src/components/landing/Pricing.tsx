'use client';

import { motion, useInView } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getBotInviteUrl } from '@/lib/discord';

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
  },
  {
    name: 'Enterprise',
    price: { monthly: 49.99, annual: 470 },
    description: 'For communities that mean business.',
    cta: 'Contact Sales',
    href: null,
    features: [
      'Everything in Pro',
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
  const isInView = useInView(containerRef, { once: true, margin: '-100px' });
  const botInviteUrl = getBotInviteUrl();

  return (
    <section className="py-28 px-4 sm:px-6 lg:px-8 bg-[var(--bg-secondary)]">
      <div className="max-w-6xl mx-auto" ref={containerRef}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
            Choose your plan
          </h2>
          <p className="text-lg text-muted-foreground mb-10">
            From hobby projects to enterprise guilds.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setIsAnnual(!isAnnual)}
              role="switch"
              aria-checked={isAnnual}
              aria-label="Toggle annual billing"
              className="relative w-14 h-7 rounded-full bg-muted border border-border transition-colors"
            >
              <motion.div
                animate={{ x: isAnnual ? 28 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-5 h-5 rounded-full bg-primary"
              />
            </button>
            <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Annual <span className="text-accent font-bold">Save 36%</span>
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
              transition={{ duration: 0.5, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className={`relative rounded-2xl bg-card p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                tier.popular
                  ? 'border-2 border-primary shadow-lg shadow-primary/10'
                  : 'border border-border'
              }`}
            >
              {/* Popular Badge */}
              {tier.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-wider">
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
                  <p className="text-sm text-accent font-semibold mt-1">
                    Save ${(tier.price.monthly * 12 - tier.price.annual).toFixed(2)}/year
                  </p>
                )}
              </div>

              {/* CTA */}
              <Button
                variant={tier.popular ? 'default' : 'outline'}
                className={`w-full mb-8 rounded-full h-12 font-bold text-sm tracking-wider uppercase hover:scale-[1.02] transition-transform ${
                  tier.popular ? 'shadow-md shadow-primary/20' : ''
                } ${!tier.href && !botInviteUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                asChild={!!(tier.href || botInviteUrl)}
                disabled={!tier.href && !botInviteUrl}
              >
                {tier.href ? (
                  <a href={tier.href} target="_blank" rel="noopener noreferrer">{tier.cta}</a>
                ) : botInviteUrl ? (
                  <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">{tier.cta}</a>
                ) : (
                  <span>{tier.cta}</span>
                )}
              </Button>

              {/* Features */}
              <ul className="space-y-3.5 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
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
      </div>
    </section>
  );
}
