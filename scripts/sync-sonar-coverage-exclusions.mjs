#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const coverageExclusionsPath = resolve(root, 'web/coverage-exclusions.json');
const sonarPropertiesPath = resolve(root, 'sonar-project.properties');
const checkOnly = process.argv.includes('--check');

function flattenExclusions(groups) {
  return Object.values(groups).flatMap((patterns) => {
    if (!Array.isArray(patterns)) {
      throw new TypeError('coverage exclusion groups must be arrays of glob patterns');
    }
    return patterns;
  });
}

function toSonarWebPath(pattern) {
  return pattern.startsWith('web/') ? pattern : `web/${pattern}`;
}

function formatSonarCoverageExclusions(groups) {
  const patterns = flattenExclusions(groups).map(toSonarWebPath);
  const lines = [
    '# Generated from web/coverage-exclusions.json by scripts/sync-sonar-coverage-exclusions.mjs.',
    '# Keep Vitest and Sonar coverage exclusions aligned by editing that shared source.',
    'sonar.coverage.exclusions=\\',
  ];

  patterns.forEach((pattern, index) => {
    const suffix = index === patterns.length - 1 ? '' : ',\\';
    lines.push(`  ${pattern}${suffix}`);
  });

  return lines.join('\n');
}

function replaceSonarCoverageExclusions(properties, replacement) {
  const start = properties.indexOf('sonar.coverage.exclusions=');
  if (start === -1) {
    throw new Error('sonar.coverage.exclusions property not found');
  }

  const beforeProperty = properties.slice(0, start);
  const commentStart = beforeProperty.lastIndexOf(
    '# Generated from web/coverage-exclusions.json by scripts/sync-sonar-coverage-exclusions.mjs.',
  );
  const replacementStart = commentStart === -1 ? start : commentStart;
  const nextProperty = properties.slice(start + 1).search(/\n[A-Za-z0-9_.-]+=|\n# [A-Z]/);
  const replacementEnd = nextProperty === -1 ? properties.length : start + 1 + nextProperty;
  const trailing = properties.slice(replacementEnd).replace(/^\n*/, '\n');

  return `${properties.slice(0, replacementStart).replace(/\s*$/, '\n')}${replacement}${trailing}`;
}

const groups = JSON.parse(await readFile(coverageExclusionsPath, 'utf8'));
const sonarProperties = await readFile(sonarPropertiesPath, 'utf8');
const nextSonarProperties = replaceSonarCoverageExclusions(
  sonarProperties,
  formatSonarCoverageExclusions(groups),
);

if (sonarProperties === nextSonarProperties) {
  console.log('Sonar coverage exclusions are in sync.');
  process.exit(0);
}

if (checkOnly) {
  console.error(
    'sonar-project.properties coverage exclusions are out of sync. Run `pnpm sonar:sync-coverage-exclusions`.',
  );
  process.exit(1);
}

await writeFile(sonarPropertiesPath, nextSonarProperties);
console.log('Updated sonar-project.properties coverage exclusions from web/coverage-exclusions.json.');
