import { describe, expect, it } from 'vitest';
import { verifyVitestCoverageExclusions } from '../../scripts/sync-sonar-coverage-exclusions.mjs';

const validConfig = `
  import { defineConfig } from 'vitest/config';
  import coverageExclusionGroups from './coverage-exclusions.json';

  export default defineConfig({
    test: {
      coverage: {
        exclude: Object.values(coverageExclusionGroups).flat(),
      },
    },
  });
`;

describe('verifyVitestCoverageExclusions', () => {
  it('accepts a direct flattened coverage exclusions JSON import in exported defineConfig', () => {
    expect(() => verifyVitestCoverageExclusions(validConfig)).not.toThrow();
  });

  it('ignores unrelated helper objects when validating exported defineConfig', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const helper = {
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      };

      export default defineConfig({
        test: {
          environment: 'jsdom',
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /defineConfig test object must define a coverage object/,
    );
  });

  it('rejects earlier non-exported defineConfig calls as coverage evidence', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const helper = defineConfig({
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      });

      export default defineConfig({
        test: {
          environment: 'jsdom',
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /defineConfig test object must define a coverage object/,
    );
  });

  it('rejects mutable intermediate flattened coverage exclusion variables', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const coverageExclusions = Object.values(coverageExclusionGroups).flat();
      coverageExclusions.push('src/generated/**');

      export default defineConfig({
        test: {
          coverage: {
            exclude: coverageExclusions,
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /coverage\.exclude must directly use Object\.values\(coverageExclusionGroups\)\.flat\(\)/,
    );
  });
});
