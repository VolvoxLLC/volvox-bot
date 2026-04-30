/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';

const expectedFocusedProxyRouteSuites = [
  'guilds-ai-feedback.test.ts',
  'guilds-config-roles-audit.test.ts',
  'guilds-conversations.test.ts',
  'guilds-members-tickets.test.ts',
  'moderation-routes.test.ts',
  'performance-thresholds.test.ts',
  'stats-temp-roles.test.ts',
] as const;

const discoveredApiSuites = Object.keys(import.meta.glob('./*.test.ts')).map((suitePath) => suitePath.replace('./', ''));

describe('proxy route test coverage inventory', () => {
  it('keeps proxy route behavior covered by focused suites', () => {
    expect(discoveredApiSuites).toEqual(expect.arrayContaining([...expectedFocusedProxyRouteSuites]));
  });
});
