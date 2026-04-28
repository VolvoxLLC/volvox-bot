#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { error as logError, info as logInfo } from '../src/logger.js';

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

function isIdentifierStart(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 36 || code === 95;
}

function isIdentifierPart(code) {
  return isIdentifierStart(code) || (code >= 48 && code <= 57);
}

function tokenizeTypeScript(config) {
  const tokens = [];
  let cursor = 0;

  while (cursor < config.length) {
    const code = config.charCodeAt(cursor);

    if (code === 9 || code === 10 || code === 13 || code === 32) {
      cursor += 1;
      continue;
    }

    const nextCode = config.charCodeAt(cursor + 1);
    if (code === 47 && nextCode === 47) {
      const newline = config.indexOf('\n', cursor + 2);
      cursor = newline === -1 ? config.length : newline + 1;
      continue;
    }

    if (code === 47 && nextCode === 42) {
      const blockEnd = config.indexOf('*/', cursor + 2);
      cursor = blockEnd === -1 ? config.length : blockEnd + 2;
      continue;
    }

    if (code === 34 || code === 39) {
      const quoteCode = code;
      const start = cursor;
      cursor += 1;
      let value = '';

      while (cursor < config.length) {
        const currentCode = config.charCodeAt(cursor);
        if (currentCode === 92) {
          if (cursor + 1 < config.length) {
            value += config[cursor + 1];
            cursor += 2;
          } else {
            cursor += 1;
          }
          continue;
        }

        if (currentCode === quoteCode) {
          cursor += 1;
          break;
        }

        value += config[cursor];
        cursor += 1;
      }

      tokens.push({ type: 'string', value, start, end: cursor });
      continue;
    }

    if (isIdentifierStart(code)) {
      const start = cursor;
      cursor += 1;
      while (cursor < config.length && isIdentifierPart(config.charCodeAt(cursor))) {
        cursor += 1;
      }

      tokens.push({ type: 'identifier', value: config.slice(start, cursor), start, end: cursor });
      continue;
    }

    tokens.push({ type: 'punctuator', value: config[cursor], start: cursor, end: cursor + 1 });
    cursor += 1;
  }

  return tokens;
}

function isToken(tokens, index, value) {
  return tokens[index]?.value === value;
}

function isIdentifierToken(tokens, index, value) {
  const token = tokens[index];
  return token?.type === 'identifier' && token.value === value;
}

function findStatementEnd(tokens, start) {
  let cursor = start;
  while (cursor < tokens.length && !isToken(tokens, cursor, ';')) {
    cursor += 1;
  }

  return cursor;
}

function findCoverageJsonImportName(tokens) {
  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    if (!isIdentifierToken(tokens, cursor, 'import')) {
      continue;
    }

    const statementEnd = findStatementEnd(tokens, cursor + 1);
    let fromIndex = -1;
    for (let index = cursor + 1; index < statementEnd; index += 1) {
      if (isIdentifierToken(tokens, index, 'from')) {
        fromIndex = index;
        break;
      }
    }

    if (fromIndex === -1 || tokens[fromIndex + 1]?.type !== 'string') {
      continue;
    }

    if (tokens[fromIndex + 1].value !== './coverage-exclusions.json') {
      continue;
    }

    let bindingIndex = cursor + 1;
    if (isIdentifierToken(tokens, bindingIndex, 'type')) {
      bindingIndex += 1;
    }

    if (tokens[bindingIndex]?.type === 'identifier') {
      return tokens[bindingIndex].value;
    }
  }

  return null;
}

function isCoverageFlattenExpressionAt(tokens, start, importName) {
  return (
    isIdentifierToken(tokens, start, 'Object') &&
    isToken(tokens, start + 1, '.') &&
    isIdentifierToken(tokens, start + 2, 'values') &&
    isToken(tokens, start + 3, '(') &&
    isIdentifierToken(tokens, start + 4, importName) &&
    isToken(tokens, start + 5, ')') &&
    isToken(tokens, start + 6, '.') &&
    isIdentifierToken(tokens, start + 7, 'flat') &&
    isToken(tokens, start + 8, '(') &&
    isToken(tokens, start + 9, ')')
  );
}

function findFlattenedCoverageNames(tokens, importName) {
  const flattenedNames = new Set();

  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    if (!isCoverageFlattenExpressionAt(tokens, cursor, importName)) {
      continue;
    }

    let equalsIndex = cursor - 1;
    while (equalsIndex >= 0 && !isToken(tokens, equalsIndex, '=') && !isToken(tokens, equalsIndex, ';')) {
      equalsIndex -= 1;
    }

    if (!isToken(tokens, equalsIndex, '=')) {
      continue;
    }

    let nameIndex = equalsIndex - 1;
    while (nameIndex >= 0 && tokens[nameIndex]?.type !== 'identifier') {
      nameIndex -= 1;
    }

    const declarationIndex = nameIndex - 1;
    if (
      tokens[nameIndex]?.type === 'identifier' &&
      (isIdentifierToken(tokens, declarationIndex, 'const') ||
        isIdentifierToken(tokens, declarationIndex, 'let') ||
        isIdentifierToken(tokens, declarationIndex, 'var'))
    ) {
      flattenedNames.add(tokens[nameIndex].value);
    }
  }

  return flattenedNames;
}

function findMatchingToken(tokens, openIndex) {
  const openValue = tokens[openIndex]?.value;
  const closeValue = openValue === '{' ? '}' : openValue === '[' ? ']' : openValue === '(' ? ')' : null;
  if (closeValue === null) {
    return -1;
  }

  let depth = 0;
  for (let cursor = openIndex; cursor < tokens.length; cursor += 1) {
    if (isToken(tokens, cursor, openValue)) {
      depth += 1;
    } else if (isToken(tokens, cursor, closeValue)) {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }

  return -1;
}

function findObjectPropertyValue(tokens, openIndex, closeIndex, keyName) {
  let depth = 0;

  for (let cursor = openIndex + 1; cursor < closeIndex; cursor += 1) {
    const token = tokens[cursor];
    if (token?.type === 'punctuator') {
      if (token.value === '{' || token.value === '[' || token.value === '(') {
        depth += 1;
        continue;
      }

      if (token.value === '}' || token.value === ']' || token.value === ')') {
        depth -= 1;
        continue;
      }
    }

    const isKey =
      depth === 0 &&
      (isIdentifierToken(tokens, cursor, keyName) ||
        (tokens[cursor]?.type === 'string' && tokens[cursor].value === keyName)) &&
      isToken(tokens, cursor + 1, ':');

    if (!isKey) {
      continue;
    }

    const valueStart = cursor + 2;
    let valueEnd = valueStart;
    let valueDepth = 0;
    while (valueEnd < closeIndex) {
      const valueToken = tokens[valueEnd];
      if (valueToken?.type === 'punctuator') {
        if (valueToken.value === '{' || valueToken.value === '[' || valueToken.value === '(') {
          valueDepth += 1;
        } else if (valueToken.value === '}' || valueToken.value === ']' || valueToken.value === ')') {
          valueDepth -= 1;
        } else if (valueToken.value === ',' && valueDepth === 0) {
          break;
        }
      }

      valueEnd += 1;
    }

    return { start: valueStart, end: valueEnd };
  }

  return null;
}

function findCoverageBlocks(tokens) {
  const blocks = [];

  for (let cursor = 0; cursor < tokens.length - 2; cursor += 1) {
    const isCoverageKey =
      (isIdentifierToken(tokens, cursor, 'coverage') ||
        (tokens[cursor]?.type === 'string' && tokens[cursor].value === 'coverage')) &&
      isToken(tokens, cursor + 1, ':') &&
      isToken(tokens, cursor + 2, '{');

    if (!isCoverageKey) {
      continue;
    }

    const closeIndex = findMatchingToken(tokens, cursor + 2);
    if (closeIndex !== -1) {
      blocks.push({ open: cursor + 2, close: closeIndex });
    }
  }

  return blocks;
}

function coverageExcludeUsesGeneratedList(tokens, valueRange, importName, flattenedNames) {
  if (valueRange.end === valueRange.start + 1 && flattenedNames.has(tokens[valueRange.start]?.value)) {
    return true;
  }

  return isCoverageFlattenExpressionAt(tokens, valueRange.start, importName) && valueRange.end === valueRange.start + 10;
}

function verifyVitestCoverageExclusions(config) {
  const failures = [];
  const tokens = tokenizeTypeScript(config);
  const importName = findCoverageJsonImportName(tokens);

  if (importName === null) {
    failures.push('web/vitest.config.ts must import ./coverage-exclusions.json with a default binding');
  }

  const flattenedNames = importName === null ? new Set() : findFlattenedCoverageNames(tokens, importName);
  const coverageBlocks = findCoverageBlocks(tokens);
  const coverageExcludeRanges = coverageBlocks
    .map((block) => findObjectPropertyValue(tokens, block.open, block.close, 'exclude'))
    .filter(Boolean);

  if (coverageBlocks.length === 0) {
    failures.push('web/vitest.config.ts must define a coverage block');
  }

  if (coverageExcludeRanges.length === 0) {
    failures.push('web/vitest.config.ts coverage block must define coverage.exclude');
  }

  if (
    importName !== null &&
    coverageExcludeRanges.length > 0 &&
    !coverageExcludeRanges.some((range) =>
      coverageExcludeUsesGeneratedList(tokens, range, importName, flattenedNames),
    )
  ) {
    failures.push(
      'web/vitest.config.ts coverage.exclude must use the flattened ./coverage-exclusions.json import',
    );
  }

  if (failures.length > 0) {
    throw new Error(`Vitest coverage exclusion wiring drifted:\n- ${failures.join('\n- ')}`);
  }
}

async function main() {
  const groups = JSON.parse(await readFile(coverageExclusionsPath, 'utf8'));
  const sonarProperties = await readFile(sonarPropertiesPath, 'utf8');
  const vitestConfig = await readFile(vitestConfigPath, 'utf8');
  verifyVitestCoverageExclusions(vitestConfig);
  const nextSonarProperties = replaceSonarCoverageExclusions(
    sonarProperties,
    formatSonarCoverageExclusions(groups),
  );

  if (sonarProperties === nextSonarProperties) {
    logInfo('Sonar coverage exclusions are in sync.');
    process.exit(0);
  }

  if (checkOnly) {
    logError(
      'sonar-project.properties coverage exclusions are out of sync. Run `pnpm sonar:sync-coverage-exclusions`.',
    );
    process.exit(1);
  }

  await writeFile(sonarPropertiesPath, nextSonarProperties);
  logInfo('Updated sonar-project.properties coverage exclusions from web/coverage-exclusions.json.');
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
