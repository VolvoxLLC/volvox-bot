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
       * Keep coverage focused on code that Vitest unit tests can meaningfully
       * exercise. Next.js App Router entrypoints, route-handler proxy glue, and
       * heavily visual shell/marketing components are validated by their route,
       * component, integration, or e2e tests instead of global unit coverage.
       */
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/types/**',
        'src/app/**',
        'src/stores/**',
        'src/contexts/analytics-context.tsx',
        'src/components/ui/**',
        'src/components/error-card.tsx',
        'src/components/theme-provider.tsx',
        // Dashboard UI is excluded from unit-test coverage because it requires complex DOM interactions
        // (drag-and-drop, rich text editors, modal flows) that are better validated through integration
        // and e2e tests. The components are manually tested and covered by dashboard integration tests.
        // TODO(#363): Add Playwright e2e suite and revisit these exclusions once automated e2e coverage
        // is in place. See discussion in PR #362 for context on why unit tests are impractical here.
        'src/components/dashboard/**',
        'src/components/landing/FeatureGrid.tsx',
        'src/components/landing/Footer.tsx',
        'src/components/landing/Hero.tsx',
        'src/components/landing/InviteButton.tsx',
        'src/components/landing/index.ts',
        // Bento cells use heavy framer-motion animations that require browser environment; tested via integration tests in dashboard-showcase.test.tsx
        'src/components/landing/bento/BentoChart.tsx',
        'src/components/landing/bento/BentoModeration.tsx',
        'src/components/landing/bento/BentoAIChat.tsx',
        'src/components/landing/bento/BentoConversations.tsx',
        'src/components/layout/LandingNavbar.tsx',
        'src/components/layout/dashboard-shell.tsx',
        'src/components/layout/header.tsx',
        'src/components/layout/mobile-sidebar.tsx',
        'src/components/layout/sidebar.tsx',
        'src/components/layout/site-footer.tsx',
        'src/hooks/use-glow-card.ts',
        'src/hooks/use-moderation-cases.ts',
        'src/hooks/use-moderation-stats.ts',
        'src/hooks/use-user-history.ts',
        'src/lib/analytics-utils.ts',
        'src/lib/api-utils.ts',
        'src/lib/log-ws.ts',
        'src/lib/logger.ts',
        'src/lib/marketing-seo-section.ts',
        'src/lib/scroll-to-section.ts',
      ],
      thresholds: {
        statements: 85,
        // Branch coverage is more volatile in jsdom/component tests; keep it high enough
        // to catch regressions without failing CI on defensive UI/environment branches.
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
