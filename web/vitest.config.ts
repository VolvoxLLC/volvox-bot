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
      reporter: ['text', 'json', 'html', 'lcov'],
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
        // Dashboard UI is excluded from unit-test coverage because it requires complex DOM interactions
        // (drag-and-drop, rich text editors, modal flows) that are better validated through integration
        // and e2e tests. The components are manually tested and covered by dashboard integration tests.
        // TODO(#363): Add Playwright e2e suite and revisit these exclusions once automated e2e coverage
        // is in place. See discussion in PR #362 for context on why unit tests are impractical here.
        'src/components/dashboard/**',
        'src/components/landing/index.ts',
        // Bento cells use heavy framer-motion animations that require browser environment; tested via integration tests in dashboard-showcase.test.tsx
        'src/components/landing/bento/BentoChart.tsx',
        'src/components/landing/bento/BentoModeration.tsx',
        'src/components/landing/bento/BentoAIChat.tsx',
        'src/components/landing/bento/BentoConversations.tsx',
        'src/components/layout/mobile-sidebar.tsx',
        'src/hooks/use-moderation-cases.ts',
        'src/hooks/use-moderation-stats.ts',
        'src/hooks/use-user-history.ts',
        'src/lib/log-ws.ts',
        'src/lib/logger.ts',
      ],
      thresholds: {
        // Web coverage floors are intentionally pinned to the 2026-04-28 baseline
        // measured in PR #626: statements 51.8, branches 45.72, functions 53.71,
        // lines 54.37. Vitest supports decimal thresholds, so these values match
        // the measured baseline exactly. Do not lower these values; ratchet
        // individual metrics upward when sustained test improvements raise the
        // observed baseline, and update Copilot docs with
        // the new provenance at the same time.
        statements: 51.8,
        branches: 45.72,
        functions: 53.71,
        lines: 54.37,
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
