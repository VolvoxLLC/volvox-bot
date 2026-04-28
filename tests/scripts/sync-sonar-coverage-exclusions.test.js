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

  it('rejects configs missing the generated coverage exclusions import', () => {
    const config = `
      import { defineConfig } from 'vitest/config';

      export default defineConfig({
        test: {
          coverage: {
            exclude: ['src/generated/**'],
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /must import \.\/coverage-exclusions\.json with a default binding/,
    );
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

  it('rejects mutations to the imported coverage exclusions object', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      coverageExclusionGroups.extra = ['src/generated/**'];

      export default defineConfig({
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /must not mutate the imported coverage exclusions JSON/,
    );
  });

  it('rejects mutating method calls on imported coverage exclusion groups', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      coverageExclusionGroups.framework.push('src/generated/**');

      export default defineConfig({
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /must not mutate the imported coverage exclusions JSON/,
    );
  });

  it('rejects Object.assign mutations of the imported coverage exclusions object inside expressions', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const mergedGroups = Object.assign(coverageExclusionGroups, { extra: ['src/generated/**'] });

      export default defineConfig({
        test: {
          coverage: {
            exclude: Object.values(mergedGroups).flat(),
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /must not mutate the imported coverage exclusions JSON/,
    );
  });

  it('allows Object.assign reads that do not target the imported coverage exclusions object', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const copiedGroups = Object.assign({}, coverageExclusionGroups);

      export default defineConfig({
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).not.toThrow();
  });

  it('allows read-only comparisons of the imported coverage exclusions object', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const hasCoverageGroups = coverageExclusionGroups !== null;

      export default defineConfig({
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).not.toThrow();
  });

  it('allows mutating methods on values derived from the imported coverage exclusions object', () => {
    const config = `
      import { defineConfig } from 'vitest/config';
      import coverageExclusionGroups from './coverage-exclusions.json';

      const sortedGroupNames = Object.keys(coverageExclusionGroups).sort();

      export default defineConfig({
        test: {
          coverage: {
            exclude: Object.values(coverageExclusionGroups).flat(),
          },
        },
      });
    `;

    expect(() => verifyVitestCoverageExclusions(config)).not.toThrow();
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
