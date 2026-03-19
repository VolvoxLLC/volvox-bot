'use client';

import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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

/**
 * Renders a configurable feature card with required basic content and optional enabled toggle and expandable advanced settings.
 *
 * @param featureId - Unique identifier for the feature; used to build element ids for anchoring and accessibility.
 * @param title - Visible title shown in the card header.
 * @param description - Short description shown under the title.
 * @param basicContent - Content shown in the Basic section of the card.
 * @param advancedContent - Optional content shown in the Advanced section when expanded.
 * @param enabled - Optional boolean representing the current enabled state of the feature; when provided and paired with `onEnabledChange`, a switch is rendered.
 * @param onEnabledChange - Optional handler invoked with the new enabled state when the switch is toggled; when omitted, no switch is shown.
 * @param disabled - When true, the enabled switch (if rendered) is disabled.
 * @param forceOpenAdvanced - When true, ensures the Advanced section is opened.
 * @param className - Optional additional class names merged into the root card.
 * @returns The rendered feature card element.
 */
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
    <div
      id={`feature-${featureId}`}
      data-enabled={hasExplicitEnabledState ? isEnabled : undefined}
      className={cn(
        'feature-card scroll-mt-24 min-w-0 rounded-2xl transition-all duration-200 motion-reduce:transition-none',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            {hasExplicitEnabledState && isEnabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Zap className="h-2.5 w-2.5" />
                Active
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        {onEnabledChange && typeof enabled === 'boolean' && (
          <div className="flex items-center gap-2 pt-0.5">
            <Switch
              id={switchId}
              checked={enabled}
              onCheckedChange={onEnabledChange}
              disabled={disabled}
              aria-label={`Toggle ${title}`}
            />
            <Label htmlFor={switchId} className="sr-only">
              {title}
            </Label>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="space-y-4 p-5">
        <section className="space-y-3" aria-label={`${title} basic settings`}>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-px flex-1 bg-border/60" />
            <span>Basic</span>
            <span className="h-px flex-1 bg-border/60" />
          </p>
          {basicContent}
        </section>

        {hasAdvanced && (
          <section className="space-y-3" aria-label={`${title} advanced settings`}>
            <Separator className="opacity-50" />
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-center gap-1.5 rounded-lg p-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={() => setIsAdvancedOpen((prev) => !prev)}
              aria-expanded={isAdvancedOpen}
              aria-controls={`feature-${featureId}-advanced`}
            >
              Advanced
              {isAdvancedOpen ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
            {isAdvancedOpen && (
              <div
                id={`feature-${featureId}-advanced`}
                className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4 transition-opacity duration-200 motion-reduce:transition-none"
              >
                {advancedContent}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
