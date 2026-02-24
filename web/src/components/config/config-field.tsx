"use client";

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  path: string;
  value: unknown;
  readOnly?: boolean;
  onUpdate: (path: string, value: unknown) => void;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/** Renders a string array as a tag-like list with add/remove. */
function StringArrayField({ label, path, value, readOnly, onUpdate }: FieldProps) {
  const items = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState("");

  const addItem = () => {
    const trimmed = draft.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onUpdate(path, [...items, trimmed]);
    setDraft("");
  };

  const removeItem = (index: number) => {
    onUpdate(
      path,
      items.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"
          >
            {item}
            {!readOnly && (
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add item..."
            className="h-8 text-xs"
          />
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** Renders a generic object as read-only key-value pairs or nested fields. */
function ObjectField({ label, path, value, readOnly, onUpdate }: FieldProps) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="ml-3 space-y-3 border-l-2 border-border pl-4">
        {entries.map(([key, val]) => (
          <ConfigField
            key={key}
            label={formatLabel(key)}
            path={`${path}.${key}`}
            value={val}
            readOnly={readOnly}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

/** Main field dispatcher — renders the appropriate input for the value type. */
export function ConfigField({ label, path, value, readOnly = false, onUpdate }: FieldProps) {
  const handleChange = useCallback(
    (newValue: unknown) => {
      if (!readOnly) onUpdate(path, newValue);
    },
    [onUpdate, path, readOnly],
  );

  // Boolean → Switch
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4 py-1">
        <Label htmlFor={path} className={cn(readOnly && "text-muted-foreground")}>
          {label}
        </Label>
        <Switch
          id={path}
          checked={value}
          onCheckedChange={(checked) => handleChange(checked)}
          disabled={readOnly}
        />
      </div>
    );
  }

  // Number → numeric Input
  if (typeof value === "number") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={path} className={cn(readOnly && "text-muted-foreground")}>
          {label}
        </Label>
        <Input
          id={path}
          type="number"
          value={value}
          onChange={(e) => {
            const num = Number(e.target.value);
            if (Number.isFinite(num)) handleChange(num);
          }}
          readOnly={readOnly}
          className={cn("h-8 text-sm", readOnly && "cursor-default opacity-70")}
        />
      </div>
    );
  }

  // String array
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return (
      <StringArrayField
        label={label}
        path={path}
        value={value}
        readOnly={readOnly}
        onUpdate={onUpdate}
      />
    );
  }

  // Generic array (e.g. escalation thresholds)
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        <Label className={cn(readOnly && "text-muted-foreground")}>{label}</Label>
        <div className="space-y-2">
          {value.map((item, i) => {
            if (typeof item === "object" && item !== null) {
              return (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  {Object.entries(item as Record<string, unknown>).map(([key, val]) => (
                    <ConfigField
                      key={key}
                      label={formatLabel(key)}
                      path={`${path}.${i}.${key}`}
                      value={val}
                      readOnly={readOnly}
                      onUpdate={onUpdate}
                    />
                  ))}
                </div>
              );
            }
            return (
              <div key={i} className="text-sm text-muted-foreground">
                {JSON.stringify(item)}
              </div>
            );
          })}
          {value.length === 0 && (
            <span className="text-xs text-muted-foreground">Empty list</span>
          )}
        </div>
      </div>
    );
  }

  // Nested object
  if (typeof value === "object" && value !== null) {
    return (
      <ObjectField
        label={label}
        path={path}
        value={value}
        readOnly={readOnly}
        onUpdate={onUpdate}
      />
    );
  }

  // null → show as disabled input
  if (value === null) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={path} className="text-muted-foreground">
          {label}
        </Label>
        <Input
          id={path}
          value="null"
          readOnly
          className="h-8 text-sm cursor-default opacity-70"
        />
      </div>
    );
  }

  // Long string → Textarea
  if (typeof value === "string" && (value.length > 100 || value.includes("\n"))) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={path} className={cn(readOnly && "text-muted-foreground")}>
          {label}
        </Label>
        <Textarea
          id={path}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={readOnly}
          rows={Math.min(10, Math.max(3, value.split("\n").length))}
          className={cn("text-sm", readOnly && "cursor-default opacity-70")}
        />
      </div>
    );
  }

  // Default: string → Input
  return (
    <div className="space-y-1.5">
      <Label htmlFor={path} className={cn(readOnly && "text-muted-foreground")}>
        {label}
      </Label>
      <Input
        id={path}
        value={String(value ?? "")}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={readOnly}
        className={cn("h-8 text-sm", readOnly && "cursor-default opacity-70")}
      />
    </div>
  );
}
