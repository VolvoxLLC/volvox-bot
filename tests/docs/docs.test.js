import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, '..', '..', 'docs');
const wikiRoot = join(docsRoot, 'wiki-pages');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readText(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
}

function readJson(filePath) {
  const content = readText(filePath);
  return content ? JSON.parse(content) : {};
}

function getAllPages(tabs) {
  const pages = [];
  for (const tab of tabs) {
    if (Array.isArray(tab.pages)) {
      pages.push(...tab.pages);
    }
    if (Array.isArray(tab.groups)) {
      for (const group of tab.groups) {
        if (Array.isArray(group.pages)) {
          pages.push(...group.pages);
        }
      }
    }
  }
  return pages;
}

function expectContainsAll(content, expectedSnippets) {
  for (const snippet of expectedSnippets) {
    expect(content).toContain(snippet);
  }
}

function getFrontmatter(content) {
  const openingFence = content.indexOf('---');
  expect(openingFence).toBe(0);

  const closingFence = content.indexOf('\n---', openingFence + 3);
  expect(closingFence).toBeGreaterThan(3);

  return content.slice(openingFence + 4, closingFence).split('\n');
}

function getLines(content, predicate) {
  return content.split('\n').filter(predicate);
}

function getFirstBraceExpansionNames(line) {
  const openingBrace = line.indexOf('{');
  const closingBrace = line.indexOf('}', openingBrace + 1);

  expect(openingBrace).toBeGreaterThanOrEqual(0);
  expect(closingBrace).toBeGreaterThan(openingBrace);

  return line.slice(openingBrace + 1, closingBrace).split(',');
}

function getSupportHelpGroup(config) {
  const supportTab = config.navigation.tabs.find((tab) => tab.tab === 'Support');
  expect(supportTab).toBeDefined();

  const helpGroup = supportTab?.groups?.find((group) => group.group === 'Help');
  expect(helpGroup).toBeDefined();
  return helpGroup;
}

function isWhitespace(character) {
  return (
    character === ' ' ||
    character === '\t' ||
    character === '\n' ||
    character === '\r' ||
    character === '\f' ||
    character === '\v'
  );
}

function splitWhitespaceTokens(line) {
  const tokens = [];
  let currentToken = '';

  for (const character of line) {
    if (isWhitespace(character)) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      continue;
    }

    currentToken += character;
  }

  if (currentToken) {
    tokens.push(currentToken);
  }

  return tokens;
}

function hasRecursiveCopyFlag(line) {
  const tokens = splitWhitespaceTokens(line);
  if (tokens[0] !== 'cp') {
    return false;
  }

  for (const token of tokens.slice(1)) {
    if (token === '--' || token === '-' || !token.startsWith('-')) {
      return false;
    }

    if (token.startsWith('--')) {
      if (token === '--recursive') {
        return true;
      }
      continue;
    }

    for (const flag of token.slice(1)) {
      if (flag === 'r' || flag === 'R') {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// helper behavior
// ---------------------------------------------------------------------------

describe('hasRecursiveCopyFlag', () => {
  it.each([
    ['accepts short -r', 'cp -r source target', true],
    ['accepts short -R', 'cp -R source target', true],
    ['accepts grouped short flags', 'cp -aR source target', true],
    ['accepts exact long option --recursive', 'cp --recursive source target', true],
    ['rejects unrelated long option --preserve', 'cp --preserve source target', false],
    ['rejects unrelated long option --parents', 'cp --parents source target', false],
    ['rejects unrelated long option --reflink=auto', 'cp --reflink=auto source target', false],
    ['stops at option terminator', 'cp -- -R source target', false],
    ['stops at lone dash', 'cp - -R target', false],
    ['stops at first operand', 'cp source -R target', false],
    ['accepts short options before recursive flag', 'cp -P -R source target', true],
  ])('%s', (_description, line, expected) => {
    expect(hasRecursiveCopyFlag(line)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// docs/docs.json
// ---------------------------------------------------------------------------

describe('docs/docs.json', () => {
  const docsJsonPath = join(docsRoot, 'docs.json');
  let config;

  beforeAll(() => {
    config = readJson(docsJsonPath);
  });

  it('file exists', () => {
    expect(existsSync(docsJsonPath)).toBe(true);
  });

  it('is valid JSON', () => {
    expect(typeof config).toBe('object');
    expect(config).not.toBeNull();
  });

  it('has $schema field pointing to mintlify', () => {
    expect(config).toHaveProperty('$schema');
    expect(config.$schema).toContain('mintlify');
  });

  it('has navigation.tabs array', () => {
    expect(config).toHaveProperty('navigation');
    expect(config.navigation).toHaveProperty('tabs');
    expect(Array.isArray(config.navigation.tabs)).toBe(true);
    expect(config.navigation.tabs.length).toBeGreaterThan(0);
  });

  it('includes "manual-test-plan" in the Support tab Help group pages', () => {
    const helpGroup = getSupportHelpGroup(config);

    expect(helpGroup.pages).toContain('manual-test-plan');
  });

  it('"manual-test-plan" is listed after "help" in the Support tab Help group pages', () => {
    const helpGroup = getSupportHelpGroup(config);

    const helpIdx = helpGroup.pages.indexOf('help');
    const planIdx = helpGroup.pages.indexOf('manual-test-plan');
    expect(helpIdx).toBeGreaterThanOrEqual(0);
    expect(planIdx).toBeGreaterThan(helpIdx);
  });

  it('the Support tab Help group contains exactly the expected pages', () => {
    const helpGroup = getSupportHelpGroup(config);

    expect(helpGroup.pages).toEqual(['faq', 'security', 'help', 'manual-test-plan']);
  });

  it('does not duplicate "manual-test-plan" across all pages', () => {
    const allPages = getAllPages(config.navigation.tabs);
    const occurrences = allPages.filter((page) => page === 'manual-test-plan').length;
    expect(occurrences).toBe(1);
  });

  it('retains existing core page entries', () => {
    const allPages = getAllPages(config.navigation.tabs);
    expectContainsAll(allPages, ['introduction', 'faq', 'security', 'help', 'changelog']);
  });
});

// ---------------------------------------------------------------------------
// docs/manual-test-plan.mdx
// ---------------------------------------------------------------------------

describe('docs/manual-test-plan.mdx', () => {
  const mdxPath = join(docsRoot, 'manual-test-plan.mdx');
  let content;

  beforeAll(() => {
    content = existsSync(mdxPath) ? readText(mdxPath) : '';
  });

  it('file exists', () => {
    expect(existsSync(mdxPath)).toBe(true);
  });

  it('has a YAML frontmatter block', () => {
    expect(getFrontmatter(content).length).toBeGreaterThan(0);
  });

  it('frontmatter contains unquoted title "Manual Test Plan"', () => {
    expect(getFrontmatter(content)).toContain('title: Manual Test Plan');
  });

  it('frontmatter contains a non-empty single-quoted description', () => {
    const descriptionLine = getFrontmatter(content).find((line) =>
      line.startsWith('description: '),
    );
    expect(descriptionLine).toBeDefined();
    const singleQuote = String.fromCharCode(39);
    const descriptionPrefix = `description: ${singleQuote}`;
    expect(descriptionLine.startsWith(descriptionPrefix)).toBe(true);
    expect(descriptionLine.endsWith(singleQuote)).toBe(true);
    expect(descriptionLine.slice(descriptionPrefix.length, -1).trim().length).toBeGreaterThan(0);
  });

  it('has a top-level # Manual Test Plan heading', () => {
    expect(content.split('\n')).toContain('# Manual Test Plan');
  });

  it('contains link to the rendered GitHub wiki page', () => {
    expect(content).toContain('https://github.com/VolvoxLLC/volvox-bot/wiki/Manual-Test-Plan');
  });

  it('has a "What it covers" section', () => {
    expect(content).toContain('## What it covers');
  });

  const coverageBullets = [
    'Environment matrix and persona setup',
    'Preconditions and release-blocking criteria',
    'End-to-end suites',
    'Negative/abuse testing',
    'Accessibility and performance spot checks',
    'Evidence collection and sign-off ownership',
  ];

  for (const bullet of coverageBullets) {
    it(`"What it covers" lists ${bullet}`, () => {
      expect(content).toContain(bullet);
    });
  }

  it('has a "Publish to GitHub Wiki" section', () => {
    expect(content).toContain('## Publish to GitHub Wiki');
  });

  it('instructs to include Manual-Test-Plan.md when publishing', () => {
    expect(content).toContain('Manual-Test-Plan.md');
  });

  it('file is non-empty and has meaningful length', () => {
    expect(content.length).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/Home.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/Home.md', () => {
  const homePath = join(wikiRoot, 'Home.md');
  let content;

  beforeAll(() => {
    content = readText(homePath);
  });

  it('file exists', () => {
    expect(existsSync(homePath)).toBe(true);
  });

  it('contains a link to Manual-Test-Plan', () => {
    expect(content).toContain('[Manual Test Plan](Manual-Test-Plan)');
  });

  it('includes Manual-Test-Plan in the recommended path steps', () => {
    expectContainsAll(content, ['Manual Test Plan', 'release candidate']);
  });

  it('recommended path step for Manual-Test-Plan is numbered 5', () => {
    const step5 = content
      .split('\n')
      .find((line) => line.startsWith('5.') && line.includes('Manual Test Plan'));
    expect(step5).toBeDefined();
  });

  it('retains existing links (Configuration Reference, Operations Runbook, Troubleshooting)', () => {
    expectContainsAll(content, [
      '[Configuration Reference](Configuration-Reference)',
      '[Operations Runbook](Operations-Runbook)',
      '[Troubleshooting](Troubleshooting)',
    ]);
  });

  it('Manual-Test-Plan link appears in the navigation list section', () => {
    const listLines = getLines(
      content,
      (line) => line.trimStart().startsWith('-') && line.includes('Manual-Test-Plan'),
    );
    expect(listLines.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/Manual-Test-Plan.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/Manual-Test-Plan.md', () => {
  const planPath = join(wikiRoot, 'Manual-Test-Plan.md');
  let content;

  beforeAll(() => {
    content = readText(planPath);
  });

  it('file exists', () => {
    expect(existsSync(planPath)).toBe(true);
  });

  it('has a top-level heading "Volvox.Bot Manual Test Plan"', () => {
    expect(content.split('\n')).toContain('# Volvox.Bot Manual Test Plan');
  });

  it('contains a "Last updated" date field', () => {
    expect(content).toContain('Last updated:');
  });

  const requiredSections = [
    '## 1) Purpose and Scope',
    '## 2) Test Environment Matrix',
    '## 3) Test Data and Preconditions',
    '## 4) Release Blocking Criteria',
    '## 5) End-to-End Test Suites',
    '## 6) Negative and Abuse Cases',
    '## 7) Accessibility Checklist (Manual)',
    '## 8) Performance and Perceived Latency (Manual)',
    '## 9) Regression Checklist for Every Release Candidate',
    '## 10) Evidence Collection Template',
    '## 11) Suggested Execution Cadence',
    '## 12) Ownership and Sign-off',
  ];

  for (const section of requiredSections) {
    it(`contains section: ${section}`, () => {
      expect(content).toContain(section);
    });
  }

  const suitesExpected = [
    'Suite A:',
    'Suite B:',
    'Suite C:',
    'Suite D:',
    'Suite E:',
    'Suite F:',
    'Suite G:',
    'Suite H:',
    'Suite I:',
    'Suite J:',
    'Suite K:',
    'Suite L:',
    'Suite M:',
    'Suite N:',
    'Suite O:',
  ];

  for (const suite of suitesExpected) {
    it(`contains ${suite}`, () => {
      expect(content).toContain(suite);
    });
  }

  const sectionExpectations = [
    {
      name: 'section 2 describes at least 3 environments (local, staging, production)',
      snippets: ['Local development', 'Staging', 'Production smoke check'],
    },
    {
      name: 'section 2 defines at least 3 Discord test guilds',
      snippets: ['Guild A', 'Guild B', 'Guild C'],
    },
    {
      name: 'section 2 defines at least 4 user personas',
      snippets: [
        'Server owner/admin',
        'Moderator',
        'Normal member',
        'User missing required permissions',
      ],
    },
    {
      name: 'section 4 specifies release-blocking criteria for uncaught errors',
      snippets: ['uncaught errors'],
    },
    {
      name: 'section 4 specifies release-blocking criteria for permission checks',
      snippets: ['Permission checks'],
    },
    {
      name: 'Suite D lists core moderation commands',
      snippets: ['warn', 'kick', 'ban', 'purge'],
    },
    {
      name: 'Suite H covers AI/conversation feature gating',
      snippets: ['AI feature flag'],
    },
    {
      name: 'section 6 lists negative/abuse input categories',
      snippets: ['Oversized inputs', 'Invalid IDs/mentions', 'Markdown/formatting injection'],
    },
    {
      name: 'section 7 accessibility checklist includes keyboard navigation',
      snippets: ['Keyboard-only navigation'],
    },
    {
      name: 'section 9 regression checklist includes a smoke check',
      snippets: ['Smoke:'],
    },
    {
      name: 'section 10 evidence template includes severity and release impact fields',
      snippets: ['Severity and release impact'],
    },
    {
      name: 'section 11 defines per-PR, pre-release RC, post-release, and monthly cadence',
      snippets: ['Per PR', 'Pre-release RC', 'Post-release', 'Monthly hardening pass'],
    },
    {
      name: 'section 12 names sign-off roles including QA/Tester and Operations owner',
      snippets: ['QA/Tester', 'Operations owner'],
    },
  ];

  for (const expectation of sectionExpectations) {
    it(expectation.name, () => {
      expectContainsAll(content, expectation.snippets);
    });
  }

  it('is a substantial document (>5000 characters)', () => {
    expect(content.length).toBeGreaterThan(5000);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/README.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/README.md', () => {
  const readmePath = join(wikiRoot, 'README.md');
  let content;

  beforeAll(() => {
    content = readText(readmePath);
  });

  it('file exists', () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  it('lists Manual-Test-Plan.md in the "Included pages" section', () => {
    expect(content).toContain('`Manual-Test-Plan.md`');
  });

  it('generic copy command includes Manual-Test-Plan in the brace expansion', () => {
    const genericLine = content
      .split('\n')
      .find(
        (line) =>
          line.trimStart().startsWith('cp') &&
          line.includes('<repo>.wiki') &&
          line.includes('Manual-Test-Plan'),
      );
    expect(genericLine).toBeDefined();
    if (!genericLine) {
      return;
    }
    expect(getFirstBraceExpansionNames(genericLine)).toContain('Manual-Test-Plan');
  });

  it('project-specific copy command for VolvoxLLC includes Manual-Test-Plan', () => {
    const volvoxLines = getLines(
      content,
      (line) => line.includes('volvox-bot.wiki') && line.includes('Manual-Test-Plan'),
    );
    expect(volvoxLines.length).toBeGreaterThanOrEqual(1);
  });

  it('both copy commands include all original pages alongside Manual-Test-Plan', () => {
    const copyLines = getLines(
      content,
      (line) => line.trimStart().startsWith('cp') && line.includes('Manual-Test-Plan'),
    );

    expect(copyLines).toHaveLength(2);
    expect(copyLines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('<repo>.wiki'),
        expect.stringContaining('volvox-bot.wiki'),
      ]),
    );

    for (const line of copyLines) {
      expectContainsAll(line, [
        'Home',
        'Quick-Start',
        'Configuration-Reference',
        'Operations-Runbook',
        'Troubleshooting',
        'Manual-Test-Plan',
      ]);
    }
  });

  it('states that README.md itself is excluded from the published wiki', () => {
    expectContainsAll(content, ['README.md', 'excluded from the published wiki']);
  });

  it('retains all original pages in the included pages list', () => {
    expectContainsAll(content, [
      '`Home.md`',
      '`Quick-Start.md`',
      '`Configuration-Reference.md`',
      '`Operations-Runbook.md`',
      '`Troubleshooting.md`',
    ]);
  });

  it('generic copy command brace expansion contains exactly 6 page names', () => {
    const genericLine = content
      .split('\n')
      .find(
        (line) =>
          line.trimStart().startsWith('cp') &&
          line.includes('<repo>.wiki') &&
          line.includes('Manual-Test-Plan'),
      );
    expect(genericLine).toBeDefined();
    if (!genericLine) {
      return;
    }
    expect(getFirstBraceExpansionNames(genericLine)).toHaveLength(6);
  });
});
