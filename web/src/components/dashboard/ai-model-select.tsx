'use client';

import { inputClasses } from '@/components/dashboard/config-editor-utils';
import { cn } from '@/lib/utils';

export const DEFAULT_AI_MODEL = 'minimax:MiniMax-M2.7';

export const AI_MODEL_OPTIONS = [
  { value: DEFAULT_AI_MODEL, label: 'MiniMax M2.7' },
  { value: 'minimax:MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 Highspeed' },
  { value: 'minimax:MiniMax-M2.5', label: 'MiniMax M2.5' },
  { value: 'minimax:MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed' },
  { value: 'moonshot:kimi-k2.6', label: 'Kimi K2.6' },
  { value: 'moonshot:kimi-k2.5', label: 'Kimi K2.5' },
  { value: 'moonshot:kimi-k2-thinking', label: 'Kimi K2 Thinking' },
  { value: 'openrouter:minimax/minimax-m2.5', label: 'MiniMax M2.5 via OpenRouter' },
  { value: 'openrouter:moonshotai/kimi-k2.6', label: 'Kimi K2.6 via OpenRouter' },
] as const;

export type AiModelValue = (typeof AI_MODEL_OPTIONS)[number]['value'];

const AI_MODEL_VALUES = AI_MODEL_OPTIONS.map((option) => option.value);

export function isSupportedAiModel(value: unknown): value is AiModelValue {
  return typeof value === 'string' && AI_MODEL_VALUES.includes(value as AiModelValue);
}

export function normalizeAiModel(value: unknown): AiModelValue {
  return isSupportedAiModel(value) ? value : DEFAULT_AI_MODEL;
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
        disabled={disabled}
        className={cn(inputClasses, 'w-full font-semibold', selectClassName)}
      >
        {AI_MODEL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
