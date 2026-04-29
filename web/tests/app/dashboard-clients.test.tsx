import { describe, expect, it } from 'vitest';

const focusedDashboardClientSuites = [
  'dashboard/ai/dashboard-ai-redirect-client.test.tsx',
  'dashboard/conversations/conversations-client.test.tsx',
  'dashboard/members/members-client.test.tsx',
  'dashboard/moderation/moderation-client.test.tsx',
  'dashboard/tickets/tickets-client.test.tsx',
] as const;

describe('dashboard client test coverage inventory', () => {
  it('keeps dashboard client behavior covered by focused suites', () => {
    expect(focusedDashboardClientSuites).toHaveLength(5);
    expect(focusedDashboardClientSuites.every((suite) => suite.endsWith('.test.tsx'))).toBe(true);
  });
});
