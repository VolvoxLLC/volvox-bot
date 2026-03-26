'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/material-dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Theme toggle dropdown component.
 *
 * Displays a button with sun/moon icons that toggles between
 * light, dark, and system themes. Uses next-themes for state management.
 */
export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-xl bg-white/[0.02] shadow-inner ring-1 ring-white/5 opacity-20" />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'relative h-9 w-9 overflow-hidden transition-all active:scale-95',
          'rounded-xl border-t border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent',
          'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_8px_-2px_rgba(0,0,0,0.3)]',
          'hover:before:absolute hover:before:inset-0 hover:before:bg-primary/5',
        )}
      >
        <div className="relative h-4 w-4">
          <Sun className="h-4 w-4 absolute inset-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 opacity-70 group-hover:opacity-100" />
          <Moon className="h-4 w-4 absolute inset-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 opacity-70 group-hover:opacity-100" />
        </div>
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="w-48 rounded-[22px] border-t border-white/20 bg-gradient-to-b from-popover/95 to-popover/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_24px_48px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
      >
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="h-3.5 w-3.5 opacity-60" />
            <span className="text-xs font-bold tracking-tight">Light Aspect</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="h-3.5 w-3.5 opacity-60" />
            <span className="text-xs font-bold tracking-tight">Dark Protocol</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <div className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-muted-foreground/20">
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
            </div>
            <span className="text-xs font-bold tracking-tight">System Default</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
