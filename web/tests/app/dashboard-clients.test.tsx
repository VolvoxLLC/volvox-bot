/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';

const expectedFocusedDashboardClientSuites = [
  'dashboard/ai/dashboard-ai-redirect-client.test.tsx',
  'dashboard/conversations/conversations-client.test.tsx',
  'dashboard/members/members-client.test.tsx',
  'dashboard/moderation/moderation-client.test.tsx',
  'dashboard/tickets/tickets-client.test.tsx',
] as const;

const discoveredDashboardClientSuites = Object.keys(import.meta.glob('./dashboard/**/*.test.tsx')).map((suitePath) =>
  suitePath.replace('./', ''),
);

describe('dashboard client test coverage inventory', () => {
  it('keeps dashboard client behavior covered by focused suites', () => {
    expect(discoveredDashboardClientSuites).toEqual(expect.arrayContaining([...expectedFocusedDashboardClientSuites]));
  });
});
