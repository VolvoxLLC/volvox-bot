"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArrayEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function ArrayEditor({
  values,
  onChange,
  placeholder = "Type and press Enter",
  className,
}: ArrayEditorProps) {
  const [input, setInput] = useState("");

  const addValue = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === "" || values.includes(trimmed)) return;
      onChange([...values, trimmed]);
    },
    [values, onChange],
  );

  const removeValue = useCallback(
    (index: number) => {
      onChange(values.filter((_, i) => i !== index));
    },
    [values, onChange],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addValue(input);
      setInput("");
    } else if (e.key === "Backspace" && input === "" && values.length > 0) {
      removeValue(values.length - 1);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      {values.map((value, index) => (
        <span
          key={value}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {value}
          <button
            type="button"
            onClick={() => removeValue(index)}
            className="ml-0.5 rounded-sm hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={values.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
