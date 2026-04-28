import { describe, expect, it } from 'vitest';
import { verifyVitestCoverageExclusions } from '../../scripts/sync-sonar-coverage-exclusions.mjs';

const generatedExcludeExpression = 'Object.values(coverageExclusionGroups).flat()';
const mutationError = /must not mutate the imported coverage exclusions JSON/;

function vitestConfig({
  importCoverageExclusions = true,
  setup = '',
  exclude = generatedExcludeExpression,
  testConfig = `coverage: { exclude: ${exclude} }`,
} = {}) {
  return `
    import { defineConfig } from 'vitest/config';
    ${importCoverageExclusions ? "import coverageExclusionGroups from './coverage-exclusions.json';" : ''}

    ${setup}

    export default defineConfig({
      test: {
        ${testConfig},
      },
    });
  `;
}

function expectMutationRejected(setup, exclude = generatedExcludeExpression) {
  expect(() => verifyVitestCoverageExclusions(vitestConfig({ setup, exclude }))).toThrow(
    mutationError,
  );
}

describe('verifyVitestCoverageExclusions', () => {
  it('accepts a direct flattened coverage exclusions JSON import in exported defineConfig', () => {
    expect(() => verifyVitestCoverageExclusions(vitestConfig())).not.toThrow();
  });

  it('rejects configs missing the generated coverage exclusions import', () => {
    expect(() =>
      verifyVitestCoverageExclusions(
        vitestConfig({
          importCoverageExclusions: false,
          exclude: "['src/generated/**']",
        }),
      ),
    ).toThrow(/must import \.\/coverage-exclusions\.json with a default binding/);
  });

  it('ignores unrelated helper objects when validating exported defineConfig', () => {
    const config = vitestConfig({
      setup: `
        const helper = {
          test: { coverage: { exclude: ${generatedExcludeExpression} } },
        };
      `,
      testConfig: "environment: 'jsdom'",
    });

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /defineConfig test object must define a coverage object/,
    );
  });

  it('rejects earlier non-exported defineConfig calls as coverage evidence', () => {
    const config = vitestConfig({
      setup: `
        const helper = defineConfig({
          test: { coverage: { exclude: ${generatedExcludeExpression} } },
        });
      `,
      testConfig: "environment: 'jsdom'",
    });

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /defineConfig test object must define a coverage object/,
    );
  });

  it('rejects mutations to the imported coverage exclusions object', () => {
    expectMutationRejected("coverageExclusionGroups.extra = ['src/generated/**'];");
  });

  it('rejects mutating method calls on imported coverage exclusion groups', () => {
    expectMutationRejected("coverageExclusionGroups.framework.push('src/generated/**');");
  });

  it('rejects optional-chained mutating method calls on imported coverage exclusion groups', () => {
    expectMutationRejected(
      "coverageExclusionGroups.dashboardPresentationSurfaces?.push('src/generated/**');",
    );
  });

  it('rejects compound assignments to imported coverage exclusions', () => {
    expectMutationRejected("coverageExclusionGroups.extra += ['src/generated/**'];");
  });

  it('rejects logical assignments to imported coverage exclusions', () => {
    expectMutationRejected('coverageExclusionGroups.extra ||= [];');
  });

  it('rejects Object.assign mutations of the imported coverage exclusions object inside expressions', () => {
    expectMutationRejected(
      "const mergedGroups = Object.assign(coverageExclusionGroups, { extra: ['src/generated/**'] });",
      'Object.values(mergedGroups).flat()',
    );
  });

  it('allows Object.assign reads that do not target the imported coverage exclusions object', () => {
    expect(() =>
      verifyVitestCoverageExclusions(
        vitestConfig({ setup: 'const copiedGroups = Object.assign({}, coverageExclusionGroups);' }),
      ),
    ).not.toThrow();
  });

  it('rejects alias mutations of the imported coverage exclusions object', () => {
    expectMutationRejected(`
      const groupsAlias = coverageExclusionGroups;
      groupsAlias.extra = ['src/generated/**'];
    `);
  });

  it('rejects mutations through aliases to nested coverage exclusion arrays', () => {
    expectMutationRejected(`
      const dashboardExclusions = coverageExclusionGroups.dashboardPresentationSurfaces;
      dashboardExclusions.push('src/generated/**');
    `);
  });

  it('rejects mutations through destructured coverage exclusion aliases', () => {
    expectMutationRejected(`
      const { dashboardPresentationSurfaces } = coverageExclusionGroups;
      dashboardPresentationSurfaces.push('src/generated/**');
    `);
  });

  it('rejects mutations through Object.values coverage exclusion aliases', () => {
    expectMutationRejected(`
      const exclusionLists = Object.values(coverageExclusionGroups);
      exclusionLists[0].push('src/generated/**');
    `);
  });

  it('rejects mutations through array-destructured Object.values aliases', () => {
    expectMutationRejected(`
      const [firstList] = Object.values(coverageExclusionGroups);
      firstList.push('src/generated/**');
    `);
  });

  it('rejects delete operations on imported coverage exclusions', () => {
    expectMutationRejected('delete coverageExclusionGroups.dashboardPresentationSurfaces;');
  });

  it('rejects mutations through shallow spread clones of imported coverage exclusions', () => {
    expectMutationRejected(`
      const clonedGroups = { ...coverageExclusionGroups };
      clonedGroups.dashboardPresentationSurfaces.push('src/generated/**');
    `);
  });

  it('rejects mutations through direct Object.values-derived exclusion arrays', () => {
    expectMutationRejected("Object.values(coverageExclusionGroups)[0].push('src/generated/**');");
  });

  it('continues mutation scans through non-mutating method calls', () => {
    expectMutationRejected(
      "Object.values(coverageExclusionGroups).at(0).push('src/generated/**');",
    );
  });

  it('continues mutation scans through optional-chained derived accesses', () => {
    expectMutationRejected(
      "Object.values(coverageExclusionGroups).at(0)?.push('src/generated/**');",
    );
  });

  it('rejects Object.assign mutations through direct Object.values-derived exclusion arrays', () => {
    expectMutationRejected(
      'Object.assign(Object.values(coverageExclusionGroups)[0], { length: 0 });',
    );
  });

  it('rejects logical assignments through direct Object.values-derived exclusion arrays', () => {
    expectMutationRejected('Object.values(coverageExclusionGroups)[0] ??= [];');
  });

  it('rejects mutations inside the exported defineConfig object', () => {
    expectMutationRejected('', "(coverageExclusionGroups.extra = ['src/generated/**'])");
  });

  it('allows read-only comparisons of the imported coverage exclusions object', () => {
    expect(() =>
      verifyVitestCoverageExclusions(
        vitestConfig({ setup: 'const hasCoverageGroups = coverageExclusionGroups !== null;' }),
      ),
    ).not.toThrow();
  });

  it('does not treat read-only comparison results as imported coverage exclusion aliases', () => {
    expect(() =>
      verifyVitestCoverageExclusions(
        vitestConfig({
          setup: `
            let hasCoverageGroups = coverageExclusionGroups !== null;
            hasCoverageGroups = true;
          `,
        }),
      ),
    ).not.toThrow();
  });

  it('allows mutating methods on values derived from the imported coverage exclusions object', () => {
    expect(() =>
      verifyVitestCoverageExclusions(
        vitestConfig({
          setup: 'const sortedGroupNames = Object.keys(coverageExclusionGroups).sort();',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects mutable intermediate flattened coverage exclusion variables', () => {
    const config = vitestConfig({
      setup: `
        const coverageExclusions = ${generatedExcludeExpression};
        coverageExclusions.push('src/generated/**');
      `,
      exclude: 'coverageExclusions',
    });

    expect(() => verifyVitestCoverageExclusions(config)).toThrow(
      /coverage\.exclude must directly use Object\.values\(coverageExclusionGroups\)\.flat\(\)/,
    );
  });
});
