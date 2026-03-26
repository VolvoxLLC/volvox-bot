import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for the Volvox web dashboard.
 *
 * Starts a Next.js dev server on port 3099 before running tests,
 * then tears it down when complete.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'pnpm dev --port 3099',
    port: 3099,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
