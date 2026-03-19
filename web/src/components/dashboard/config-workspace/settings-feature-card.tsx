'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <Card
      id={`feature-${featureId}`}
      className={cn(
        'scroll-mt-24 min-w-0 transition-shadow duration-200 motion-reduce:transition-none',
        className,
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
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
      </CardHeader>

      <CardContent className="space-y-4">
        <section className="space-y-3" aria-label={`${title} basic settings`}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Basic</p>
          {basicContent}
        </section>

        {hasAdvanced && (
          <section className="space-y-3" aria-label={`${title} advanced settings`}>
            <Separator />
            <Button
              type="button"
              variant="ghost"
              className="h-auto p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              onClick={() => setIsAdvancedOpen((prev) => !prev)}
              aria-expanded={isAdvancedOpen}
              aria-controls={`feature-${featureId}-advanced`}
            >
              Advanced
              {isAdvancedOpen ? (
                <ChevronUp className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
            {isAdvancedOpen && (
              <div
                id={`feature-${featureId}-advanced`}
                className="space-y-3 transition-opacity duration-200 motion-reduce:transition-none"
              >
                {advancedContent}
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
