'use client';

import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Theme provider wrapper for next-themes.
 *
 * Provides system-aware dark/light mode support with CSS variable theming.
 * Defaults to system preference on first load.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
