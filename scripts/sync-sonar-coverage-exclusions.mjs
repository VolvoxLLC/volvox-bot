#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coverageExclusionsPath = resolve(root, 'web/coverage-exclusions.json');
const sonarPropertiesPath = resolve(root, 'sonar-project.properties');
const vitestConfigPath = resolve(root, 'web/vitest.config.ts');
const checkOnly = process.argv.includes('--check');

const sonarGeneratedStart = '# BEGIN generated coverage exclusions from web/coverage-exclusions.json';
const sonarGeneratedEnd = '# END generated coverage exclusions from web/coverage-exclusions.json';

function flattenExclusions(groups) {
  if (groups === null || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new TypeError('coverage exclusions must be an object of named pattern arrays');
  }

  return Object.entries(groups).flatMap(([groupName, patterns]) => {
    if (!Array.isArray(patterns)) {
      throw new TypeError(`coverage exclusion group "${groupName}" must be an array of glob patterns`);
    }

    patterns.forEach((pattern) => {
      if (typeof pattern !== 'string' || pattern.trim().length === 0) {
        throw new TypeError(`coverage exclusion group "${groupName}" contains a non-empty string pattern only`);
      }
    });

    return patterns;
  });
}

function toSonarWebPath(pattern) {
  return pattern.startsWith('web/') ? pattern : `web/${pattern}`;
}

function formatSonarCoverageExclusions(groups) {
  const patterns = flattenExclusions(groups).map(toSonarWebPath);
  const lines = [
    sonarGeneratedStart,
    '# DO NOT EDIT THIS BLOCK. Edit only web/coverage-exclusions.json, then run:',
    '#   pnpm sonar:sync-coverage-exclusions',
    '# Vitest imports that JSON directly; pnpm sonar:check-coverage-exclusions checks this block and the Vitest wiring.',
    patterns.length === 0 ? 'sonar.coverage.exclusions=' : 'sonar.coverage.exclusions=\\',
  ];

  patterns.forEach((pattern, index) => {
    const suffix = index === patterns.length - 1 ? '' : ',\\';
    lines.push(`  ${pattern}${suffix}`);
  });

  lines.push(sonarGeneratedEnd);

  return lines.join('\n');
}

function countOccurrences(value, needle) {
  let count = 0;
  let cursor = 0;

  while (cursor < value.length) {
    const index = value.indexOf(needle, cursor);
    if (index === -1) {
      break;
    }

    count += 1;
    cursor = index + needle.length;
  }

  return count;
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

function replaceSonarCoverageExclusions(properties, replacement) {
  const startMarkerCount = countOccurrences(properties, sonarGeneratedStart);
  const endMarkerCount = countOccurrences(properties, sonarGeneratedEnd);
  if (startMarkerCount !== 1 || endMarkerCount !== 1) {
    throw new Error(
      `sonar-project.properties must contain exactly one generated coverage exclusions block marked with "${sonarGeneratedStart}" and "${sonarGeneratedEnd}"`,
    );
  }

  const replacementStart = properties.indexOf(sonarGeneratedStart);
  const replacementEnd = properties.indexOf(sonarGeneratedEnd, replacementStart) + sonarGeneratedEnd.length;
  const generatedBlock = properties.slice(replacementStart, replacementEnd);

  if (!generatedBlock.includes('sonar.coverage.exclusions=')) {
    throw new Error('generated coverage exclusions block must contain sonar.coverage.exclusions');
  }

  const trailing = normalizeLeadingNewline(properties.slice(replacementEnd));

  return `${trimEndToNewline(properties.slice(0, replacementStart))}${replacement}${trailing}`;
}

function getValueAfterKey(config, key, fromIndex = 0) {
  const keyIndex = config.indexOf(key, fromIndex);
  if (keyIndex === -1) {
    return null;
  }

  let valueIndex = keyIndex + key.length;
  while (valueIndex < config.length) {
    const code = config.charCodeAt(valueIndex);
    const isWhitespace = code === 9 || code === 10 || code === 13 || code === 32;
    if (!isWhitespace) {
      break;
    }
    valueIndex += 1;
  }

  return config.slice(valueIndex);
}

function verifyVitestCoverageExclusions(config) {
  const failures = [];
  const canonicalImport = "import coverageExclusionGroups from './coverage-exclusions.json';";
  const derivedExclusions = 'const coverageExclusions = Object.values(coverageExclusionGroups).flat();';

  if (!config.includes(canonicalImport)) {
    failures.push(`web/vitest.config.ts must import the canonical source exactly as: ${canonicalImport}`);
  }

  if (!config.includes(derivedExclusions)) {
    failures.push('web/vitest.config.ts must derive coverageExclusions by flattening coverageExclusionGroups');
  }

  const excludeValue = getValueAfterKey(config, 'exclude:');
  if (excludeValue === null || !excludeValue.startsWith('coverageExclusions')) {
    failures.push('web/vitest.config.ts coverage.exclude must use coverageExclusions from web/coverage-exclusions.json');
  }

  const coverageBlock = getValueAfterKey(config, 'coverage:');
  const coverageExcludeValue = coverageBlock === null ? null : getValueAfterKey(coverageBlock, 'exclude:');
  if (coverageExcludeValue !== null && coverageExcludeValue.startsWith('[')) {
    failures.push('web/vitest.config.ts must not inline a coverage exclude array');
  }

  if (failures.length > 0) {
    throw new Error(`Vitest coverage exclusion wiring drifted:\n- ${failures.join('\n- ')}`);
  }
}

const groups = JSON.parse(await readFile(coverageExclusionsPath, 'utf8'));
const sonarProperties = await readFile(sonarPropertiesPath, 'utf8');
const vitestConfig = await readFile(vitestConfigPath, 'utf8');
verifyVitestCoverageExclusions(vitestConfig);
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
