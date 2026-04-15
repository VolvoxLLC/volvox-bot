'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type * as React from 'react';

/**
 * Theme provider wrapper for next-themes.
 *
 * Provides system-aware dark/light mode support with CSS variable theming.
 * Defaults to system preference on first load.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
