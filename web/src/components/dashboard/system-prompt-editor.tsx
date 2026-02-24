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
import { SYSTEM_PROMPT_MAX_LENGTH } from "@/types/config";

/** Threshold (percentage of max) at which the counter turns to a warning color. */
const WARNING_THRESHOLD = 0.9;

interface SystemPromptEditorProps {
  /** Current prompt text. */
  value: string;
  /** Called with the updated prompt text. */
  onChange: (value: string) => void;
  /** Maximum allowed characters. */
  maxLength?: number;
  /** Whether the editor is disabled. */
  disabled?: boolean;
}

/**
 * Renders a card UI for editing and validating a system prompt with live character counting and visual feedback.
 *
 * The component displays a textarea bound to `value`, shows a character counter and an over-limit message when the
 * input exceeds `maxLength`, applies warning styling when near the threshold, and exposes updates through `onChange`.
 * It includes accessible attributes (aria-describedby, aria-invalid, polite live region) and supports a disabled state.
 *
 * @param value - Current system prompt text shown in the editor
 * @param onChange - Callback invoked with the updated text when the textarea value changes
 * @param maxLength - Maximum allowed characters for the prompt; defaults to the configured SYSTEM_PROMPT_MAX_LENGTH
 * @param disabled - If true, disables editing and dims the control
 * @returns The JSX element rendering the System Prompt editor card
 */
export function SystemPromptEditor({
  value,
  onChange,
  maxLength = SYSTEM_PROMPT_MAX_LENGTH,
  disabled = false,
}: SystemPromptEditorProps) {
  const id = useId();
  const counterId = `${id}-counter`;
  const descriptionId = `${id}-description`;

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
        <CardDescription id={descriptionId}>
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
          aria-describedby={`${descriptionId} ${counterId}`}
          aria-invalid={isOverLimit || undefined}
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            isOverLimit && "border-destructive focus-visible:ring-destructive",
          )}
          placeholder="Enter the system prompt for your bot..."
        />
        <div className="flex items-center justify-end gap-2 text-xs">
          <span
            id={counterId}
            className={cn(
              "tabular-nums",
              isOverLimit
                ? "font-medium text-destructive"
                : isNearLimit
                  ? "text-yellow-500"
                  : "text-muted-foreground",
            )}
            role="status"
            aria-live="polite"
          >
            {charCount.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
          {isOverLimit && (
            <span className="text-destructive" role="alert">
              ({(charCount - maxLength).toLocaleString()} over limit)
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
