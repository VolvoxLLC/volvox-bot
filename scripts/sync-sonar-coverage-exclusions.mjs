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

function assertCoverageExclusionPattern(groupName, pattern) {
  if (typeof pattern !== 'string' || pattern.trim().length === 0) {
    throw new TypeError(`coverage exclusion group "${groupName}" contains a non-empty string pattern only`);
  }

  const invalidCharacterChecks = [
    [',', 'comma'],
    ['\\', 'backslash'],
    ['\n', 'newline'],
    ['\r', 'carriage return'],
  ];

  const invalidCharacter = invalidCharacterChecks.find(([character]) => pattern.includes(character));
  if (invalidCharacter !== undefined) {
    throw new TypeError(
      `coverage exclusion group "${groupName}" contains a pattern with unsupported ${invalidCharacter[1]}`,
    );
  }
}

function flattenExclusions(groups) {
  if (groups === null || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new TypeError('coverage exclusions must be an object of named pattern arrays');
  }

  return Object.entries(groups).flatMap(([groupName, patterns]) => {
    if (!Array.isArray(patterns)) {
      throw new TypeError(`coverage exclusion group "${groupName}" must be an array of glob patterns`);
    }

    patterns.forEach((pattern) => assertCoverageExclusionPattern(groupName, pattern));

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

function findImportStatementBounds(tokens, importIndex) {
  return { start: importIndex, end: findStatementEnd(tokens, importIndex + 1) };
}

function findIdentifierInRange(tokens, start, end, identifierName) {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (isIdentifierToken(tokens, cursor, identifierName)) {
      return cursor;
    }
  }

  return -1;
}

function findImportSourceToken(tokens, bounds) {
  const fromIndex = findIdentifierInRange(tokens, bounds.start + 1, bounds.end, 'from');
  return fromIndex === -1 ? null : tokens[fromIndex + 1] ?? null;
}

function importSourceMatches(tokens, importIndex, sourcePath) {
  const sourceToken = findImportSourceToken(tokens, findImportStatementBounds(tokens, importIndex));
  return sourceToken?.type === 'string' && sourceToken.value === sourcePath;
}

function readDefaultImportBinding(tokens, importIndex) {
  let bindingIndex = importIndex + 1;
  if (isIdentifierToken(tokens, bindingIndex, 'type')) {
    bindingIndex += 1;
  }

  const bindingToken = tokens[bindingIndex];
  return bindingToken?.type === 'identifier' ? bindingToken.value : null;
}

function findCoverageJsonImportName(tokens) {
  for (let cursor = 0; cursor < tokens.length; cursor += 1) {
    if (isIdentifierToken(tokens, cursor, 'import') && importSourceMatches(tokens, cursor, './coverage-exclusions.json')) {
      const bindingName = readDefaultImportBinding(tokens, cursor);
      if (bindingName !== null) {
        return bindingName;
      }
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

function isOpeningTokenValue(value) {
  return value === '{' || value === '[' || value === '(';
}

function isClosingTokenValue(value) {
  return value === '}' || value === ']' || value === ')';
}

function nestingDelta(token) {
  if (token?.type !== 'punctuator') {
    return 0;
  }

  if (isOpeningTokenValue(token.value)) {
    return 1;
  }

  return isClosingTokenValue(token.value) ? -1 : 0;
}

function isObjectPropertyKey(tokens, index, keyName) {
  return (
    (isIdentifierToken(tokens, index, keyName) ||
      (tokens[index]?.type === 'string' && tokens[index].value === keyName)) &&
    isToken(tokens, index + 1, ':')
  );
}

function findTopLevelPropertyKey(tokens, openIndex, closeIndex, keyName) {
  let depth = 0;

  for (let cursor = openIndex + 1; cursor < closeIndex; cursor += 1) {
    depth += nestingDelta(tokens[cursor]);

    if (depth === 0 && isObjectPropertyKey(tokens, cursor, keyName)) {
      return cursor;
    }
  }

  return -1;
}

function findPropertyValueEnd(tokens, valueStart, closeIndex) {
  let depth = 0;

  for (let cursor = valueStart; cursor < closeIndex; cursor += 1) {
    const token = tokens[cursor];
    if (token?.value === ',' && depth === 0) {
      return cursor;
    }

    depth += nestingDelta(token);
  }

  return closeIndex;
}

function findObjectPropertyValue(tokens, openIndex, closeIndex, keyName) {
  const keyIndex = findTopLevelPropertyKey(tokens, openIndex, closeIndex, keyName);
  if (keyIndex === -1) {
    return null;
  }

  const valueStart = keyIndex + 2;
  return { start: valueStart, end: findPropertyValueEnd(tokens, valueStart, closeIndex) };
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
