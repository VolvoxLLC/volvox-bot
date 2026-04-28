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
        // Next metadata/image handlers are framework integration surfaces that
        // are exercised by Next build/runtime rather than unit tests.
        'src/app/opengraph-image.tsx',
        'src/app/robots.ts',
        'src/app/sitemap.ts',
        'src/components/ui/**',
        'src/components/error-card.tsx',
        'src/components/theme-provider.tsx',
        // Dashboard chart/table shells below are browser-composition surfaces
        // (Recharts measurements, virtualized tables, rich form widgets, or event-driven
        // browser integrations). Core data/query/export/runtime logic stays covered in
        // contexts, stores, API routes, and focused helpers instead of a broad dashboard glob.
        'src/components/dashboard/action-badge.tsx',
        'src/components/dashboard/analytics-dashboard.tsx',
        'src/components/dashboard/case-detail.tsx',
        'src/components/dashboard/case-table.tsx',
        'src/components/dashboard/config-categories/ai-automation.tsx',
        'src/components/dashboard/config-categories/community-tools.tsx',
        'src/components/dashboard/config-categories/config-category-layout.tsx',
        'src/components/dashboard/config-categories/config-landing.tsx',
        'src/components/dashboard/config-categories/moderation-safety.tsx',
        // Large tabbed onboarding/settings composer wires rich editors and variable widgets;
        // targeted behavior tests exercise its critical flows while browser e2e should own layout coverage.
        'src/components/dashboard/config-categories/onboarding-growth.tsx',
        'src/components/dashboard/config-categories/support-integrations.tsx',
        'src/components/dashboard/config-editor.tsx',
        'src/components/dashboard/config-layout-shell.tsx',
        'src/components/dashboard/config-sections/AuditLogSection.tsx',
        'src/components/dashboard/config-sections/ChallengesSection.tsx',
        'src/components/dashboard/config-sections/ChannelModeSection.tsx',
        'src/components/dashboard/config-sections/CommunityFeaturesSection.tsx',
        'src/components/dashboard/config-sections/EngagementSection.tsx',
        'src/components/dashboard/config-sections/GitHubSection.tsx',
        'src/components/dashboard/config-sections/MemorySection.tsx',
        'src/components/dashboard/config-sections/PermissionsSection.tsx',
        'src/components/dashboard/config-sections/StarboardSection.tsx',
        'src/components/dashboard/config-sections/TicketsSection.tsx',
        'src/components/dashboard/config-sections/index.ts',
        'src/components/dashboard/config-workspace/category-navigation.tsx',
        'src/components/dashboard/config-workspace/config-search.tsx',
        'src/components/dashboard/config-workspace/settings-feature-card.tsx',
        'src/components/dashboard/config-workspace/types.ts',
        'src/components/dashboard/conversation-replay.tsx',
        'src/components/dashboard/dashboard-card.tsx',
        'src/components/dashboard/empty-state.tsx',
        'src/components/dashboard/floating-save-island.tsx',
        'src/components/dashboard/health-cards.tsx',
        'src/components/dashboard/health-section.tsx',
        'src/components/dashboard/log-filters.tsx',
        'src/components/dashboard/log-viewer.tsx',
        'src/components/dashboard/member-table.tsx',
        'src/components/dashboard/moderation-stats.tsx',
        'src/components/dashboard/moderation-types.ts',
        'src/components/dashboard/page-header.tsx',
        'src/components/dashboard/performance-dashboard.tsx',
        'src/components/dashboard/reset-defaults-button.tsx',
        'src/components/dashboard/restart-history.tsx',
        'src/components/dashboard/settings-tabs.tsx',
        'src/components/dashboard/system-prompt-editor.tsx',
        'src/components/dashboard/toggle-switch.tsx',
        'src/components/dashboard/types.ts',
        'src/components/dashboard/xp-level-actions-editor.tsx',
        // Barrel-only export surface; behavior is covered through individual components.
        'src/components/landing/index.ts',
        // Animation-heavy hero/grid sections depend on browser viewport and framer-motion
        // timing; validate their visible behavior in browser/e2e coverage.
        'src/components/landing/FeatureGrid.tsx',
        'src/components/landing/Hero.tsx',
        // CTA wrapper is Next/navigation integration only; button behavior is covered
        // by sections that render it with real invite URLs.
        'src/components/landing/InviteButton.tsx',
        // Bento cells are visual animation-only children of DashboardShowcase;
        // data and Showcase behavior have focused unit tests.
        'src/components/landing/bento/BentoChart.tsx',
        'src/components/landing/bento/BentoModeration.tsx',
        'src/components/landing/bento/BentoAIChat.tsx',
        'src/components/landing/bento/BentoConversations.tsx',
        // Navigation shells are browser-only responsive composition layers;
        // the underlying directory providers/selectors are covered directly.
        'src/components/layout/LandingNavbar.tsx',
        'src/components/layout/dashboard-shell.tsx',
        'src/components/layout/mobile-sidebar.tsx',
        'src/components/layout/sidebar.tsx',
        'src/components/layout/site-footer.tsx',
        // Browser lifecycle hooks/providers depend on viewport or analytics SDK
        // side effects and are better verified in browser-level tests.
        'src/hooks/use-glow-card.ts',
        'src/hooks/use-moderation-cases.ts',
        'src/hooks/use-moderation-stats.ts',
        'src/hooks/use-user-history.ts',
        'src/lib/logger.ts',
        'src/lib/scroll-to-section.ts',
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
