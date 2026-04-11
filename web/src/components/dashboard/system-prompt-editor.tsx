'use client';

import { MessageSquareText } from 'lucide-react';
import { useCallback, useId } from 'react';
import { inputClasses } from '@/components/dashboard/config-editor-utils';
import { cn } from '@/lib/utils';
import { SYSTEM_PROMPT_MAX_LENGTH } from '@/types/config';

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
 * Renders a block UI for editing and validating a system prompt with live character counting and visual feedback.
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
    <div className="p-6 rounded-[24px] border border-border/40 bg-muted/20 backdrop-blur-xl">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold tracking-wide text-foreground/90">System Prompt</h3>
        <p
          id={descriptionId}
          className="text-[11px] text-muted-foreground/60 uppercase tracking-wider"
        >
          Define core identity, instructions, and behavior boundaries
        </p>
      </div>
      <div className="space-y-4">
        <label htmlFor={id} className="sr-only">
          System prompt
        </label>
        <div className="relative group/textarea">
          <div className="absolute top-4 left-4 text-muted-foreground/30 group-focus-within/textarea:text-primary/40 transition-colors pointer-events-none">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <textarea
            id={id}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            rows={14}
            aria-describedby={`${descriptionId} ${counterId}`}
            aria-invalid={isOverLimit || undefined}
            className={cn(
              inputClasses,
              'pl-12 pt-4 bg-muted/10 dark:bg-black/20 resize-none font-medium leading-relaxed',
              isOverLimit &&
                'border-destructive/50 focus-visible:ring-destructive/30 focus-visible:border-destructive/30 shadow-[inset_0_2px_8px_rgba(239,68,68,0.1)]',
              disabled && 'opacity-40 grayscale-[0.5]',
            )}
            placeholder="Tell the AI who to be (e.g. 'You are a helpful and witty technical assistant...')"
          />
        </div>
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            {isOverLimit && (
              <span
                className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-500 border border-red-500/20 shadow-sm"
                role="alert"
              >
                <span className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />
                {(charCount - maxLength).toLocaleString()} over limit
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1 w-32 bg-muted/30 dark:bg-black/40 rounded-full overflow-hidden shadow-inner">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  isOverLimit ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-primary/60',
                )}
                style={{ width: `${Math.min((charCount / maxLength) * 100, 100)}%` }}
              />
            </div>
            <output
              id={counterId}
              className={cn(
                'text-[10px] font-black uppercase tracking-widest tabular-nums',
                isOverLimit
                  ? 'text-red-500'
                  : isNearLimit
                    ? 'text-yellow-500'
                    : 'text-muted-foreground/60',
              )}
              aria-live="off"
            >
              {charCount.toLocaleString()} / {maxLength.toLocaleString()}
            </output>
          </div>
        </div>
      </div>
    </div>
  );
}
