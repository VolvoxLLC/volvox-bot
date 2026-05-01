import { describe, expect, it } from 'vitest';
import coverageExclusions from '../../coverage-exclusions.json';

describe('coverage exclusions', () => {
  it('should exclude Next.js and Sentry framework glue from coverage gates', () => {
    expect(coverageExclusions.typesAndFrameworkGlue).toEqual(
      expect.arrayContaining([
        'src/instrumentation.ts',
        'src/instrumentation-client.ts',
        'src/sentry.server.config.ts',
        'src/sentry.edge.config.ts',
      ]),
    );
  });
});
