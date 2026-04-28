#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coverageExclusionsPath = resolve(root, 'web/coverage-exclusions.json');
const sonarPropertiesPath = resolve(root, 'sonar-project.properties');
const vitestConfigPath = resolve(root, 'web/vitest.config.ts');
const checkOnly = process.argv.includes('--check');

function writeLine(stream, message) {
  stream.write(`${message}\n`);
}

function logInfo(message) {
  writeLine(process.stdout, message);
}

function logError(message) {
  writeLine(process.stderr, message);
}

const sonarGeneratedStart = '# BEGIN generated coverage exclusions from web/coverage-exclusions.json';
const sonarGeneratedEnd = '# END generated coverage exclusions from web/coverage-exclusions.json';

function assertCoverageExclusionPattern(groupName, pattern) {
  if (typeof pattern !== 'string' || pattern.trim().length === 0) {
    throw new TypeError(`coverage exclusion group "${groupName}" contains an empty or non-string pattern`);
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
  if (needle.length === 0) {
    throw new TypeError('needle must not be empty');
  }

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

function findExportedDefineConfigObject(tokens) {
  for (let cursor = 0; cursor < tokens.length - 4; cursor += 1) {
    if (
      isIdentifierToken(tokens, cursor, 'export') &&
      isIdentifierToken(tokens, cursor + 1, 'default') &&
      isIdentifierToken(tokens, cursor + 2, 'defineConfig') &&
      isToken(tokens, cursor + 3, '(') &&
      isToken(tokens, cursor + 4, '{')
    ) {
      const closeIndex = findMatchingToken(tokens, cursor + 4);
      if (closeIndex !== -1) {
        return { start: cursor, open: cursor + 4, close: closeIndex };
      }
    }
  }

  return null;
}

function findObjectPropertyObject(tokens, objectRange, keyName) {
  const valueRange = findObjectPropertyValue(tokens, objectRange.open, objectRange.close, keyName);
  if (valueRange === null || !isToken(tokens, valueRange.start, '{')) {
    return null;
  }

  const closeIndex = findMatchingToken(tokens, valueRange.start);
  return closeIndex !== -1 && closeIndex <= valueRange.end
    ? { open: valueRange.start, close: closeIndex }
    : null;
}

function coverageExcludeUsesGeneratedList(tokens, valueRange, importName) {
  return isCoverageFlattenExpressionAt(tokens, valueRange.start, importName) && valueRange.end === valueRange.start + 10;
}

const mutatingArrayMethods = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

function isAssignmentOperatorAt(tokens, index) {
  if (!isToken(tokens, index, '=')) {
    return false;
  }

  const previous = tokens[index - 1]?.value;
  const next = tokens[index + 1]?.value;
  return previous !== '=' && previous !== '!' && previous !== '<' && previous !== '>' && next !== '=' && next !== '>';
}

function findBracketAccessEnd(tokens, openIndex, end) {
  const closeIndex = findMatchingToken(tokens, openIndex);
  return closeIndex !== -1 && closeIndex < end ? closeIndex + 1 : openIndex + 1;
}

function importedAccessMutates(tokens, importUseIndex, end) {
  let cursor = importUseIndex + 1;

  while (cursor < end) {
    if (isToken(tokens, cursor, '[')) {
      cursor = findBracketAccessEnd(tokens, cursor, end);
      continue;
    }

    if (!isToken(tokens, cursor, '.') || tokens[cursor + 1]?.type !== 'identifier') {
      break;
    }

    const memberName = tokens[cursor + 1].value;
    if (mutatingArrayMethods.has(memberName) && isToken(tokens, cursor + 2, '(')) {
      return true;
    }

    cursor += 2;
  }

  return isAssignmentOperatorAt(tokens, cursor) ||
    (isToken(tokens, cursor, '+') && isToken(tokens, cursor + 1, '+')) ||
    (isToken(tokens, cursor, '-') && isToken(tokens, cursor + 1, '-'));
}

function objectAssignMutatesImportedExclusionGroups(tokens, cursor, importName) {
  return (
    isIdentifierToken(tokens, cursor, 'Object') &&
    isToken(tokens, cursor + 1, '.') &&
    isIdentifierToken(tokens, cursor + 2, 'assign') &&
    isToken(tokens, cursor + 3, '(') &&
    isIdentifierToken(tokens, cursor + 4, importName)
  );
}

function statementMutatesImportedExclusionGroups(tokens, start, end, importName) {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (objectAssignMutatesImportedExclusionGroups(tokens, cursor, importName)) {
      return true;
    }

    if (isIdentifierToken(tokens, cursor, importName) && importedAccessMutates(tokens, cursor, end)) {
      return true;
    }
  }

  return false;
}

function hasImportedExclusionGroupMutationBefore(tokens, importName, endIndex) {
  let cursor = 0;
  while (cursor < endIndex) {
    const statementEnd = Math.min(findStatementEnd(tokens, cursor), endIndex);
    if (statementMutatesImportedExclusionGroups(tokens, cursor, statementEnd, importName)) {
      return true;
    }

    cursor = statementEnd + 1;
  }

  return false;
}

function verifyVitestCoverageExclusions(config) {
  const failures = [];
  const tokens = tokenizeTypeScript(config);
  const importName = findCoverageJsonImportName(tokens);

  if (importName === null) {
    failures.push('web/vitest.config.ts must import ./coverage-exclusions.json with a default binding');
  }

  const configObject = findExportedDefineConfigObject(tokens);
  const testObject = configObject === null ? null : findObjectPropertyObject(tokens, configObject, 'test');
  const coverageObject = testObject === null ? null : findObjectPropertyObject(tokens, testObject, 'coverage');
  const coverageExcludeRange =
    coverageObject === null
      ? null
      : findObjectPropertyValue(tokens, coverageObject.open, coverageObject.close, 'exclude');

  if (configObject === null) {
    failures.push('web/vitest.config.ts must export default defineConfig with an object literal');
  }

  if (testObject === null) {
    failures.push('web/vitest.config.ts defineConfig object must define a test object');
  }

  if (coverageObject === null) {
    failures.push('web/vitest.config.ts defineConfig test object must define a coverage object');
  }

  if (coverageExcludeRange === null) {
    failures.push('web/vitest.config.ts defineConfig test.coverage object must define coverage.exclude');
  }

  if (
    importName !== null &&
    configObject !== null &&
    hasImportedExclusionGroupMutationBefore(tokens, importName, configObject.start)
  ) {
    failures.push('web/vitest.config.ts must not mutate the imported coverage exclusions JSON');
  }

  if (
    importName !== null &&
    coverageExcludeRange !== null &&
    !coverageExcludeUsesGeneratedList(tokens, coverageExcludeRange, importName)
  ) {
    failures.push(
      'web/vitest.config.ts coverage.exclude must directly use Object.values(coverageExclusionGroups).flat()',
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

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main().catch((error) => {
    logError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { verifyVitestCoverageExclusions };
