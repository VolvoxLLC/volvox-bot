import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/deploy-commands.js'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
