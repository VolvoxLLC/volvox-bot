'use client';

import { Switch } from '@/components/ui/switch';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

/**
 * Renders an accessible toggle switch control.
 *
 * @param checked - Current on/off state of the switch.
 * @param onChange - Callback invoked with the new checked state when the switch is toggled.
 * @param disabled - When true, disables user interaction.
 * @param label - Human-readable name used for the switch's ARIA label.
 * @returns The button element acting as a toggle switch.
 */
export function ToggleSwitch({ checked, onChange, disabled, label }: ToggleSwitchProps) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={`Toggle ${label}`}
    />
  );
}
