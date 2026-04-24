'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'group/switch peer relative inline-flex shrink-0 items-center rounded-full border border-border transition-all duration-500 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary bg-muted/50 dark:bg-black/60 shadow-inner dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),0_1px_1px_rgba(255,255,255,0.05)]',
        'data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-4 data-[size=sm]:w-8',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-foreground  shadow-sm dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-500 data-[state=checked]:bg-background data-[state=checked]:shadow-[0_0_10px_rgba(var(--primary),0.5)]',
          'group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-2.5',
          'data-[state=checked]:group-data-[size=default]/switch:translate-x-6 data-[state=unchecked]:translate-x-1',
          'data-[state=checked]:group-data-[size=sm]/switch:translate-x-[1.125rem]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
