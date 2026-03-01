'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
}

export function NumberField({ label, value, onChange, disabled, min, step }: NumberFieldProps) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return;
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          onChange(num);
        }}
        disabled={disabled}
      />
    </div>
  );
}
