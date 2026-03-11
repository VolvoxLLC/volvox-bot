import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      /**
       * Use a broad include pattern so all source files contribute to coverage
       * metrics by default. Rely on the `exclude` list below for any files
       * that should be intentionally ignored (e.g., framework glue code,
       * types, or UI that is impractical to test).
       */
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/types/**',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
        'src/app/global-error.tsx',
        'src/app/globals.css',
        'src/stores/**',
        'src/components/ui/**',
        'src/components/error-card.tsx',
        'src/components/theme-provider.tsx',
        // Dashboard UI is covered via end-to-end tests and excluded from the unit-test coverage contract.
        'src/components/dashboard/**',
        'src/components/landing/index.ts',
        'src/components/layout/mobile-sidebar.tsx',
        'src/hooks/use-moderation-cases.ts',
        'src/hooks/use-moderation-stats.ts',
        'src/hooks/use-user-history.ts',
        'src/lib/log-ws.ts',
        'src/lib/logger.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'server-only': resolve(__dirname, './tests/__mocks__/server-only.ts'),
    },
  },
});
