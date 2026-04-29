'use client';

import { inputClasses } from '@/components/dashboard/config-editor-utils';
import {
  getVisibleProviderModelValue,
  VISIBLE_PROVIDER_MODEL_OPTION_GROUPS,
  VISIBLE_PROVIDER_MODEL_OPTIONS,
} from '@/lib/provider-model-options';
import { cn } from '@/lib/utils';

export const DEFAULT_AI_MODEL = VISIBLE_PROVIDER_MODEL_OPTIONS[0]?.value ?? '';

const hasVisibleModelOptions = VISIBLE_PROVIDER_MODEL_OPTIONS.length > 0;

export type AiModelValue = string;

export function isSupportedAiModel(value: unknown): value is AiModelValue {
  return (
    typeof value === 'string' &&
    VISIBLE_PROVIDER_MODEL_OPTIONS.some((option) => option.value === value)
  );
}

export function normalizeAiModel(value: unknown): AiModelValue {
  return getVisibleProviderModelValue(typeof value === 'string' ? value : undefined);
}

type AiModelSelectProps = {
  id: string;
  label: string;
  value: unknown;
  onChange: (value: AiModelValue) => void;
  disabled?: boolean;
  wrapperClassName?: string;
  labelClassName?: string;
  selectClassName?: string;
};

export function AiModelSelect({
  id,
  label,
  value,
  onChange,
  disabled = false,
  wrapperClassName,
  labelClassName,
  selectClassName,
}: AiModelSelectProps) {
  return (
    <div className={cn('space-y-3', wrapperClassName)}>
      <label
        htmlFor={id}
        className={cn('text-sm font-bold tracking-tight text-foreground/80', labelClassName)}
      >
        {label}
      </label>
      <select
        id={id}
        value={normalizeAiModel(value)}
        onChange={(event) => onChange(event.target.value as AiModelValue)}
        disabled={disabled || !hasVisibleModelOptions}
        className={cn(inputClasses, 'w-full font-semibold', selectClassName)}
      >
        {hasVisibleModelOptions ? (
          VISIBLE_PROVIDER_MODEL_OPTION_GROUPS.map((group) => (
            <optgroup key={group.providerName} label={group.providerDisplayName}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))
        ) : (
          <option value="">No visible models configured</option>
        )}
      </select>
    </div>
  );
}
