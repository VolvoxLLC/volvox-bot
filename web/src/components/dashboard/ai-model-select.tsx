'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_AI_MODEL,
  getVisibleProviderModelValue,
  VISIBLE_PROVIDER_MODEL_OPTION_GROUPS,
  VISIBLE_PROVIDER_MODEL_OPTIONS,
} from '@/lib/provider-model-options';
import { cn } from '@/lib/utils';

export { DEFAULT_AI_MODEL };

const hasVisibleModelOptions = VISIBLE_PROVIDER_MODEL_OPTIONS.length > 0;

export type AiModelValue = string;

export function isSupportedAiModel(value: unknown): value is AiModelValue {
  return (
    typeof value === 'string' &&
    VISIBLE_PROVIDER_MODEL_OPTIONS.some(
      (option) => option.value.toLowerCase() === value.toLowerCase(),
    )
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
  const selectedValue = normalizeAiModel(value);
  const hasSelectedVisibleOption = isSupportedAiModel(selectedValue);

  return (
    <div className={cn('space-y-3', wrapperClassName)}>
      <label
        htmlFor={id}
        className={cn('text-sm font-bold tracking-tight text-foreground/80', labelClassName)}
      >
        {label}
      </label>
      <Select
        value={selectedValue}
        onValueChange={(selectedValue) => onChange(selectedValue as AiModelValue)}
        disabled={disabled || !hasVisibleModelOptions}
      >
        <SelectTrigger id={id} className={cn('w-full font-semibold', selectClassName)}>
          <SelectValue placeholder="No visible models configured" />
        </SelectTrigger>
        <SelectContent>
          {selectedValue && !hasSelectedVisibleOption && (
            <SelectItem value={selectedValue}>Current saved model: {selectedValue}</SelectItem>
          )}
          {VISIBLE_PROVIDER_MODEL_OPTION_GROUPS.map((group) => (
            <SelectGroup key={group.providerName}>
              <SelectLabel>{group.providerDisplayName}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
