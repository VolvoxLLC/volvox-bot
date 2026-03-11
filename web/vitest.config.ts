import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/types/**",
        "src/app/**",
        "src/app/layout.tsx",
        "src/app/globals.css",
        "src/stores/**",
        "src/components/ui/**",
        "src/components/error-card.tsx",
        "src/components/dashboard/action-badge.tsx",
        "src/components/dashboard/ai-feedback-stats.tsx",
        "src/components/dashboard/analytics-dashboard.tsx",
        "src/components/dashboard/case-detail.tsx",
        "src/components/dashboard/case-table.tsx",
        "src/components/dashboard/config-editor.tsx",
        "src/components/dashboard/conversation-replay.tsx",
        "src/components/dashboard/health-cards.tsx",
        "src/components/dashboard/health-section.tsx",
        "src/components/dashboard/log-filters.tsx",
        "src/components/dashboard/member-table.tsx",
        "src/components/dashboard/moderation-stats.tsx",
        "src/components/dashboard/moderation-types.ts",
        "src/components/dashboard/performance-dashboard.tsx",
        "src/components/dashboard/reset-defaults-button.tsx",
        "src/components/dashboard/restart-history.tsx",
        "src/components/dashboard/system-prompt-editor.tsx",
        "src/components/dashboard/types.ts",
        "src/components/dashboard/config-sections/**",
        "src/hooks/use-moderation-cases.ts",
        "src/hooks/use-moderation-stats.ts",
        "src/hooks/use-user-history.ts",
        "src/lib/log-ws.ts",
        "src/lib/logger.ts",
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
      "@": resolve(__dirname, "./src"),
      "server-only": resolve(__dirname, "./tests/__mocks__/server-only.ts"),
    },
  },
});
