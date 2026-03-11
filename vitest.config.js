import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/deploy-commands.js',
        'src/modules/events/reactionCreate.js',
        'src/modules/events/reactions.js',
        'src/modules/events/voiceState.js',
        'src/modules/handlers/reminderHandler.js',
        'src/modules/handlers/ticketHandler.js',
        'src/modules/handlers/welcomeOnboardingHandler.js',
        'src/utils/discordCache.js',
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
