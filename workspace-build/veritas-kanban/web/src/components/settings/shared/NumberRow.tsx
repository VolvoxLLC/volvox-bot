import { memo, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { SettingRow } from './SettingRow';

export const NumberRow = memo(function NumberRow({ label, description, value, onChange, min, max, step, unit, hideSpinners, maxLength }: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hideSpinners?: boolean;
  maxLength?: number;
}) {
  // Use text input with local state - only save on blur
  const [localValue, setLocalValue] = useState(value.toString());
  
  // Sync local value when external value changes (e.g., reset)
  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  if (hideSpinners) {
    const handleBlur = () => {
      const raw = localValue.replace(/[^0-9]/g, '');
      if (raw === '') {
        setLocalValue((min ?? 0).toString());
        onChange(min ?? 0);
        return;
      }
      const v = parseInt(raw, 10);
      if (!isNaN(v)) {
        const clamped = Math.max(min ?? 0, Math.min(max ?? Infinity, v));
        setLocalValue(clamped.toString());
        onChange(clamped);
      }
    };

    return (
      <SettingRow label={label} description={description}>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={localValue}
            onChange={(e) => {
              // Only allow digits, update local state without saving
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setLocalValue(raw);
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleBlur();
                (e.target as HTMLInputElement).blur();
              }
            }}
            maxLength={maxLength ?? 10}
            className="w-28 h-8 text-right"
          />
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
      </SettingRow>
    );
  }

  return (
    <SettingRow label={label} description={description}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
              onChange(clamped);
            }
          }}
          min={min}
          max={max}
          step={step}
          className="w-24 h-8 text-right"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </SettingRow>
  );
});
