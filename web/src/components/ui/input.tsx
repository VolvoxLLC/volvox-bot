import type * as React from 'react';

import { cn } from '@/lib/utils';

const TEXT_SELECTABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);

/**
 * Input element that automatically selects its contents when focused and accepts all standard input props.
 *
 * @param className - Additional CSS classes applied to the input
 * @param type - Input `type` attribute (e.g., "text", "email")
 * @param onFocus - Optional focus event handler that is called after the input's contents are selected
 * @returns The rendered input element
 */
function Input({ className, type, onFocus, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      onFocus={(e) => {
        if (!type || TEXT_SELECTABLE_INPUT_TYPES.has(type)) {
          e.currentTarget.select();
        }
        onFocus?.(e);
      }}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
