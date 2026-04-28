#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

function trimEndToNewline(value) {
  let end = value.length;
  while (end > 0) {
    const code = value.charCodeAt(end - 1);
    const isWhitespace = code === 9 || code === 10 || code === 13 || code === 32;
    if (!isWhitespace) {
      break;
    }
    end -= 1;
  }

  return `${value.slice(0, end)}\n`;
}

function normalizeLeadingNewline(value) {
  if (value.length === 0) {
    return '';
  }

  let start = 0;
  while (start < value.length) {
    const code = value.charCodeAt(start);
    const isNewline = code === 10 || code === 13;
    if (!isNewline) {
      break;
    }
    start += 1;
  }

  return `\n${value.slice(start)}`;
}

function findCoverageExclusionsEnd(properties, start) {
  let cursor = start;

  while (cursor < properties.length) {
    const nextNewline = properties.indexOf('\n', cursor);
    const lineEnd = nextNewline === -1 ? properties.length : nextNewline;
    const line = properties.slice(cursor, lineEnd).trimEnd();

    if (!line.endsWith('\\')) {
      return lineEnd;
    }

    if (nextNewline === -1) {
      return properties.length;
    }

    cursor = nextNewline + 1;
  }

  return properties.length;
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
  const replacementEnd = findCoverageExclusionsEnd(properties, start);
  const trailing = normalizeLeadingNewline(properties.slice(replacementEnd));

  return `${trimEndToNewline(properties.slice(0, replacementStart))}${replacement}${trailing}`;
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
