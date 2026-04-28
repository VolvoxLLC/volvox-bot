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

/**
 * Convert a mapping of named exclusion groups into a single flat array of glob patterns.
 *
 * @param {Object<string, string[]>} groups - An object whose keys are group names and values are arrays of non-empty glob pattern strings.
 * @returns {string[]} A flat array containing all glob patterns from every group in declaration order.
 * @throws {TypeError} If `groups` is not an object, if any group value is not an array, or if any pattern is not a non-empty string.
 */
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

/**
 * Ensure a glob pattern is rooted under the `web/` directory.
 * @param {string} pattern - A file glob or path pattern.
 * @returns {string} The same pattern prefixed with `web/` if it did not already start with `web/`.
 */
function toSonarWebPath(pattern) {
  return pattern.startsWith('web/') ? pattern : `web/${pattern}`;
}

/**
 * Build the generated sonar.coverage.exclusions block from grouped glob patterns.
 *
 * @param {Object<string, string[]>} groups - An object whose keys are group names and values are arrays of glob pattern strings; each pattern will be normalized to the repository's web/ path prefix.
 * @returns {string} A multi-line string containing the generated-start marker, instructional comments, a `sonar.coverage.exclusions` entry (empty or line-continuated list), the normalized patterns, and the generated-end marker.
 */
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

/**
 * Count occurrences of a substring within a string.
 * @param {string} value - The string to search.
 * @param {string} needle - The substring to count.
 * @returns {number} The number of non-overlapping occurrences of `needle` in `value`.
 * If `needle` is an empty string, the function will not terminate.
 */
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

/**
 * Remove trailing spaces, tabs, carriage returns, and newlines, then ensure the string ends with a single `\n`.
 * @param {string} value - Input string to normalize.
 * @returns {string} The resulting string with trailing whitespace removed and exactly one newline appended.
 */
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

/**
 * Normalize leading newline characters so the result begins with exactly one `\n`.
 *
 * @param {string} value - The input string to normalize.
 * @returns {string} `''` if `value` is empty, otherwise `value` with all leading `\n` and `\r` characters removed and a single leading `\n` prepended.
 */
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

/**
 * Replace the generated sonar.coverage.exclusions block inside a sonar-project.properties file.
 *
 * Locates the single generated block delimited by the script's start and end markers, verifies that
 * the block contains `sonar.coverage.exclusions=`, and returns a new file string where that entire
 * generated block is replaced with `replacement`. The prefix before the start marker is trimmed to
 * end with exactly one newline; the suffix after the end marker is normalized to begin with a single newline.
 *
 * @param {string} properties - The full contents of a sonar-project.properties file.
 * @param {string} replacement - The replacement text that will substitute the entire generated block (including markers).
 * @returns {string} The updated sonar-project.properties content with the generated block replaced.
 * @throws {Error} If the file does not contain exactly one start marker and one end marker, or if the located generated block does not include `sonar.coverage.exclusions=`.
 */
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

/**
 * Determine whether a numeric character code is a valid JavaScript identifier start.
 * @param {number} code - The character code to test.
 * @returns {boolean} `true` if the code is `A–Z`, `a–z`, `$` (36), or `_` (95); `false` otherwise.
 */
function isIdentifierStart(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 36 || code === 95;
}

/**
 * Determines whether a Unicode code point may appear after the first character of an identifier.
 * @param {number} code - The Unicode code point (character code) to test.
 * @returns {boolean} `true` if the code point is a valid identifier part (an identifier start or an ASCII digit 0–9), `false` otherwise.
 */
function isIdentifierPart(code) {
  return isIdentifierStart(code) || (code >= 48 && code <= 57);
}

/**
 * Tokenizes TypeScript source text into a simple stream of syntactic tokens.
 *
 * Skips whitespace and comments, recognizes identifiers, string literals, and single-character punctuators.
 * String token `value` contains the unescaped contents of the literal (without surrounding quotes).
 * `start` and `end` are indices into the original `config` string that bound the token (end is one past the last character).
 *
 * @param {string} config - The TypeScript source text to tokenize.
 * @returns {Array<{type: 'identifier'|'string'|'punctuator', value: string, start: number, end: number}>} An ordered list of tokens extracted from `config`.
 */
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

/**
 * Checks whether the token at the given index has the specified value.
 * @param {Array<{type:string,value:string,start:number,end:number}>} tokens - Token list to inspect; each token must have a `value` property.
 * @param {number} index - Index of the token to check.
 * @param {string} value - Expected token value.
 * @returns {boolean} `true` if a token exists at `index` and its `value` equals `value`, `false` otherwise.
 */
function isToken(tokens, index, value) {
  return tokens[index]?.value === value;
}

/**
 * Determines whether the token at the given index is an identifier with the specified value.
 * @param {Array<{type:string,value:string}>} tokens - Array of tokens produced by the tokenizer.
 * @param {number} index - Index of the token to inspect.
 * @param {string} value - Expected identifier value.
 * @returns {boolean} `true` if the token at `index` is an identifier with `value`, `false` otherwise.
 */
function isIdentifierToken(tokens, index, value) {
  const token = tokens[index];
  return token?.type === 'identifier' && token.value === value;
}

/**
 * Locate the semicolon that ends a statement starting at the given token index.
 *
 * @param {Array<{type:string,value:string,start:number,end:number}>} tokens - Array of tokens to search.
 * @param {number} start - Index in `tokens` to begin searching from.
 * @returns {number} The index of the terminating semicolon token, or `tokens.length` if no semicolon is found.
 */
function findStatementEnd(tokens, start) {
  let cursor = start;
  while (cursor < tokens.length && !isToken(tokens, cursor, ';')) {
    cursor += 1;
  }

  return cursor;
}

/**
 * Finds the default import binding name for the module "./coverage-exclusions.json" in a token list.
 *
 * Recognizes ES module `import` statements and ignores an optional `type` token (i.e., `import type Name from ...`).
 * @param {Array<{type: string, value: string, start?: number, end?: number}>} tokens - Token stream produced from TypeScript source.
 * @returns {string|null} The identifier used as the default import binding for "./coverage-exclusions.json", or `null` if no matching default import is present.
 */
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

/**
 * Checks whether tokens at a given index form the expression `Object.values(<importName>).flat()`.
 *
 * @param {Array} tokens - Token list produced by tokenizeTypeScript.
 * @param {number} start - Index in `tokens` to test.
 * @param {string} importName - The identifier name expected inside `Object.values(...)`.
 * @returns {boolean} `true` if the token sequence at `start` exactly matches `Object.values(importName).flat()`, `false` otherwise.
 */
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

/**
 * Collects variable names that are declared and initialized from `Object.values(<importName>).flat()`.
 *
 * Scans the token list for expressions matching `Object.values(importName).flat()` and, when such an expression
 * appears on the right-hand side of an assignment whose left-hand side is an identifier declared with
 * `const`, `let`, or `var`, adds that identifier name to the result set.
 *
 * @param {{type: string, value: string, start: number, end: number}[]} tokens - Tokenized TypeScript source.
 * @param {string} importName - The identifier name used for the default import from "./coverage-exclusions.json".
 * @returns {Set<string>} A set of identifier names that are assigned the flattened import values; empty if none found.
 */
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

/**
 * Find the index of the matching closing punctuator for a given opening punctuator token.
 *
 * Scans forward from openIndex and tracks nesting of `{ }`, `[ ]`, or `( )` to locate the corresponding closing token.
 *
 * @param {{type: string, value: string, start?: number, end?: number}[]} tokens - Token list produced from source text.
 * @param {number} openIndex - Index of the opening punctuator token (`{`, `[`, or `(`).
 * @returns {number} The index of the matching closing token, or `-1` if no match is found or the token at openIndex is not a supported opening punctuator.
 */
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

/**
 * Find the token range that represents the value of a property with the given key inside an object literal.
 *
 * Searches tokens between openIndex and closeIndex for a top-level property whose key is either the identifier keyName
 * or the string literal keyName followed immediately by a colon, then returns the start and end token indices that
 * delimit the property's value expression. The value range ends at the first top-level comma or the provided closeIndex.
 *
 * @param {Array<{type:string,value:string,start:number,end:number}>} tokens - Token list for the source text.
 * @param {number} openIndex - Index of the object literal's opening `{` token.
 * @param {number} closeIndex - Index of the object literal's closing `}` token (exclusive bound for the search).
 * @param {string} keyName - Property key to find (matched as an identifier or a string literal).
 * @returns {{start:number,end:number}|null} An object with `start` and `end` token indices for the property's value, or `null` if the property is not found.
 */
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

/**
 * Locate object literal ranges for properties named `coverage` within a token list.
 * @param {Array} tokens - Token array produced by tokenizeTypeScript.
 * @returns {Array<{open: number, close: number}>} An array of ranges where `open` is the token index of the `{` that starts the coverage object and `close` is the index of its matching `}`.
 */
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

/**
 * Determines whether a coverage.exclude value references the generated flattened exclusions.
 *
 * @param {Array<{type:string,value:string,start:number,end:number}>} tokens - Token list for the TypeScript source.
 * @param {{start:number,end:number}} valueRange - Token index range (start inclusive, end exclusive) of the value expression to inspect.
 * @param {string} importName - The default import binding name for "./coverage-exclusions.json".
 * @param {Set<string>} flattenedNames - Set of identifier names that hold the flattened generated exclusions.
 * @returns {boolean} `true` if the value is either a single identifier present in `flattenedNames` or the exact `Object.values(importName).flat()` expression, `false` otherwise.
 */
function coverageExcludeUsesGeneratedList(tokens, valueRange, importName, flattenedNames) {
  if (valueRange.end === valueRange.start + 1 && flattenedNames.has(tokens[valueRange.start]?.value)) {
    return true;
  }

  return isCoverageFlattenExpressionAt(tokens, valueRange.start, importName) && valueRange.end === valueRange.start + 10;
}

/**
 * Validate that web/vitest.config.ts imports and uses the generated coverage exclusions.
 *
 * Tokenizes the provided TypeScript source, checks for a default import from
 * "./coverage-exclusions.json", ensures at least one `coverage` block exists with a
 * `coverage.exclude` property, and verifies that at least one `coverage.exclude` uses
 * the flattened imported exclusions.
 *
 * @param {string} config - The contents of web/vitest.config.ts.
 * @throws {Error} If the config is missing the required import, missing any coverage block,
 *                  missing any `coverage.exclude`, or if no `coverage.exclude` is wired to
 *                  use the flattened ./coverage-exclusions.json import. The thrown error
 *                  lists all detected failures.
 */
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

/**
 * Synchronizes the generated sonar.coverage.exclusions block in sonar-project.properties with web/coverage-exclusions.json and validates that web/vitest.config.ts is wired to consume the generated list.
 *
 * Reads the coverage exclusions JSON, the Sonar properties file, and the Vitest config; validates Vitest imports and usage; computes the updated generated block and replaces the existing marked block in sonar-project.properties. If the files are already in sync the process exits with code 0. If differences are found and the script was invoked with --check, the process logs an error and exits with code 1. Otherwise the updated properties file is written and a success message is logged.
 */
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
