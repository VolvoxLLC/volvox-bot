"use client";

import { useCallback, useId } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Discord message character limit. */
const DEFAULT_MAX_LENGTH = 4000;

/** Threshold (percentage of max) at which the counter turns to a warning color. */
const WARNING_THRESHOLD = 0.9;

interface SystemPromptEditorProps {
  /** Current prompt text. */
  value: string;
  /** Called with the updated prompt text. */
  onChange: (value: string) => void;
  /** Maximum allowed characters (defaults to 4000). */
  maxLength?: number;
  /** Whether the editor is disabled. */
  disabled?: boolean;
}

export function SystemPromptEditor({
  value,
  onChange,
  maxLength = DEFAULT_MAX_LENGTH,
  disabled = false,
}: SystemPromptEditorProps) {
  const id = useId();

  const charCount = value.length;
  const isOverLimit = charCount > maxLength;
  const isNearLimit = charCount >= maxLength * WARNING_THRESHOLD;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">System Prompt</CardTitle>
        <CardDescription>
          The personality and instructions for the AI assistant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <label htmlFor={id} className="sr-only">
          System prompt
        </label>
        <textarea
          id={id}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          rows={12}
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            isOverLimit && "border-destructive focus-visible:ring-destructive",
          )}
          placeholder="Enter the system prompt for your bot..."
        />
        <div className="flex items-center justify-end gap-2 text-xs">
          <span
            className={cn(
              "tabular-nums",
              isOverLimit
                ? "font-medium text-destructive"
                : isNearLimit
                  ? "text-yellow-500"
                  : "text-muted-foreground",
            )}
          >
            {charCount.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
          {isOverLimit && (
            <span className="text-destructive">
              ({(charCount - maxLength).toLocaleString()} over limit)
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
