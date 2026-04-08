'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Zap } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ConfigFeatureId } from './types';

interface SettingsFeatureCardProps {
  featureId: ConfigFeatureId;
  title: string;
  description: string;
  basicContent: ReactNode;
  advancedContent?: ReactNode;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  disabled?: boolean;
  forceOpenAdvanced?: boolean;
  className?: string;
}

export function SettingsFeatureCard({
  featureId,
  title,
  description,
  basicContent,
  advancedContent,
  enabled,
  onEnabledChange,
  disabled = false,
  forceOpenAdvanced = false,
  className,
}: SettingsFeatureCardProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const switchId = useId();

  useEffect(() => {
    if (forceOpenAdvanced) {
      setIsAdvancedOpen(true);
    }
  }, [forceOpenAdvanced]);

  const hasAdvanced = Boolean(advancedContent);
  const hasExplicitEnabledState = typeof enabled === 'boolean';
  const isEnabled = enabled === true;

  return (
    <motion.div
      id={`feature-${featureId}`}
      data-enabled={hasExplicitEnabledState ? isEnabled : undefined}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative overflow-hidden backdrop-blur-3xl bg-background/40 dark:bg-black/40 rounded-[32px] border border-border shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all duration-500',
        className,
      )}
    >
      {/* Header Section */}
      <div className="relative p-6 px-7 flex items-start justify-between gap-6 z-10">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-bold tracking-tight text-foreground/90 drop-shadow-sm">
              {title}
            </h3>
            {hasExplicitEnabledState && isEnabled && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary border border-primary/20 shadow-[0_0_12px_rgba(var(--primary),0.2)]">
                <Zap className="h-2.5 w-2.5 fill-current" />
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-2xl">
            {description}
          </p>
        </div>

        {onEnabledChange && typeof enabled === 'boolean' && (
          <div className="flex items-center pt-1 shrink-0">
            <Switch
              id={switchId}
              checked={enabled}
              onCheckedChange={onEnabledChange}
              disabled={disabled}
              className="data-[state=checked]:bg-primary"
              aria-label={`Toggle ${title}`}
            />
            <Label htmlFor={switchId} className="sr-only">
              {title}
            </Label>
          </div>
        )}
      </div>

      {/* Basic Settings Container */}
      <div className="px-7 pb-3 space-y-6">
        <div className="relative p-6 rounded-[24px] bg-muted/20 dark:bg-black/20 border border-border/50 dark:border-white/[0.03] shadow-inner dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="space-y-5">{basicContent}</div>
        </div>

        {/* Advanced Section */}
        {hasAdvanced && (
          <div className="py-2">
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'group/btn relative w-full flex items-center justify-between h-12 px-6 rounded-2xl transition-all duration-300 overflow-hidden',
                isAdvancedOpen
                  ? 'bg-muted/40 dark:bg-white/[0.03] hover:bg-muted/60 shadow-inner dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
                  : 'hover:bg-primary/5 dark:hover:bg-white/5',
              )}
              onClick={() => setIsAdvancedOpen((prev) => !prev)}
              aria-expanded={isAdvancedOpen}
              aria-controls={`feature-${featureId}-advanced`}
            >
              <span
                className={cn(
                  'text-[11px] font-bold uppercase tracking-[0.2em] transition-colors duration-300',
                  isAdvancedOpen
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover/btn:text-foreground/80',
                )}
              >
                Advanced Configuration
              </span>
              <div
                className={cn(
                  'flex items-center justify-center h-6 w-6 rounded-full bg-muted/40 dark:bg-black/40 shadow-sm dark:shadow-[0_2px_4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-transform duration-500',
                  isAdvancedOpen ? 'rotate-180 text-primary' : 'text-muted-foreground',
                )}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </Button>

            <AnimatePresence>
              {isAdvancedOpen && (
                <motion.div
                  id={`feature-${featureId}-advanced`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 pb-4 px-1">
                    <div className="p-6 rounded-[24px] bg-muted/30 dark:bg-black/30 border border-border/50 dark:border-white/[0.02] shadow-inner dark:shadow-[inset_0_4px_12px_rgba(0,0,0,0.5)] space-y-5">
                      {advancedContent}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Decorative Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
    </motion.div>
  );
}
