import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import coverageExclusionGroups from './coverage-exclusions.json';

const coverageExclusions = Object.values(coverageExclusionGroups).flat();

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
      exclude: coverageExclusions,
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
