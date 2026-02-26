const inputClasses =
  "w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
}

export function NumberField({ label, value, onChange, disabled, min, step }: NumberFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return;
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          onChange(num);
        }}
        disabled={disabled}
        className={inputClasses}
      />
    </label>
  );
}
