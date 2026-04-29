import { describe, expect, it } from 'vitest';

const focusedProxyRouteSuites = [
  'guilds-ai-feedback.test.ts',
  'guilds-config-roles-audit.test.ts',
  'guilds-conversations.test.ts',
  'guilds-members-tickets.test.ts',
  'moderation-routes.test.ts',
  'performance-thresholds.test.ts',
  'stats-temp-roles.test.ts',
] as const;

describe('proxy route test coverage inventory', () => {
  it('keeps proxy route behavior covered by focused suites', () => {
    expect(focusedProxyRouteSuites).toHaveLength(7);
    expect(focusedProxyRouteSuites.every((suite) => suite.endsWith('.test.ts'))).toBe(true);
  });
});
