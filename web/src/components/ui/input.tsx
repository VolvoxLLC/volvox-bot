import type * as React from 'react';

import { cn } from '@/lib/utils';

const SELECT_ALL_ON_FOCUS_TYPES = new Set(['number']);

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
        if (type && SELECT_ALL_ON_FOCUS_TYPES.has(type)) {
          e.currentTarget.select();
        }
        onFocus?.(e);
      }}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground/40 selection:bg-primary selection:text-primary-foreground dark:bg-card/40 border-border/40 h-11 w-full min-w-0 rounded-[14px] border bg-transparent px-4 py-2 text-sm shadow-sm backdrop-blur-md transition-all outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-primary/30',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
