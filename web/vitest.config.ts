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
      include: [
        'src/proxy.ts',
        'src/components/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/app/api/bot-health/route.ts',
        'src/app/api/guilds/route.ts',
        'src/app/api/guilds/*/analytics/route.ts',
        'src/app/api/health/route.ts',
        'src/app/api/log-stream/ws-ticket/route.ts',
      ],
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
