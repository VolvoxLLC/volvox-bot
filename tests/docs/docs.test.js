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

  return line
    .slice(openingBrace + 1, closingBrace)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function getSupportHelpGroup(config) {
  const supportTab = config.navigation.tabs.find((tab) => tab.tab === 'Support');
  expect(supportTab).toBeDefined();

  const helpGroup = supportTab?.groups?.find((group) => group.group === 'Help');
  expect(helpGroup).toBeDefined();
  return helpGroup;
}

// ---------------------------------------------------------------------------
// docs/docs.json
// ---------------------------------------------------------------------------

describe('docs/docs.json', () => {
  const docsJsonPath = join(docsRoot, 'docs.json');
  let rawConfig;

  beforeAll(() => {
    rawConfig = readText(docsJsonPath);
  });

  function getConfig() {
    return JSON.parse(rawConfig);
  }

  it('file exists', () => {
    expect(existsSync(docsJsonPath)).toBe(true);
  });

  it('is valid JSON', () => {
    expect(rawConfig.length).toBeGreaterThan(0);
    const config = JSON.parse(rawConfig);
    expect(typeof config).toBe('object');
    expect(config).not.toBeNull();
  });

  it('has $schema field pointing to mintlify', () => {
    const config = getConfig();

    expect(config).toHaveProperty('$schema');
    expect(config.$schema).toContain('mintlify');
  });

  it('has navigation.tabs array', () => {
    const config = getConfig();

    expect(config).toHaveProperty('navigation');
    expect(config.navigation).toHaveProperty('tabs');
    expect(Array.isArray(config.navigation.tabs)).toBe(true);
    expect(config.navigation.tabs.length).toBeGreaterThan(0);
  });

  it('includes "manual-test-plan" in the Support tab Help group pages', () => {
    const config = getConfig();
    const helpGroup = getSupportHelpGroup(config);

    expect(helpGroup.pages).toContain('manual-test-plan');
  });

  it('"manual-test-plan" is listed after "help" in the Support tab Help group pages', () => {
    const config = getConfig();
    const helpGroup = getSupportHelpGroup(config);

    const helpIdx = helpGroup.pages.indexOf('help');
    const planIdx = helpGroup.pages.indexOf('manual-test-plan');
    expect(helpIdx).toBeGreaterThanOrEqual(0);
    expect(planIdx).toBeGreaterThan(helpIdx);
  });

  it('the Support tab Help group retains the expected support pages', () => {
    const config = getConfig();
    const helpGroup = getSupportHelpGroup(config);

    expectContainsAll(helpGroup.pages, ['faq', 'security', 'help', 'manual-test-plan']);
  });

  it('does not duplicate "manual-test-plan" across all pages', () => {
    const config = getConfig();
    const allPages = getAllPages(config.navigation.tabs);
    const occurrences = allPages.filter((page) => page === 'manual-test-plan').length;
    expect(occurrences).toBe(1);
  });

  it('retains existing core page entries', () => {
    const config = getConfig();
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
    const singleQuote = "'";
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
    expect(content).toContain('[Manual Test Plan](./Manual-Test-Plan.md)');
  });

  it('includes Manual-Test-Plan in the recommended path steps', () => {
    expectContainsAll(content, ['Manual Test Plan', 'release candidate']);
  });

  it('recommended path links Manual-Test-Plan after Troubleshooting', () => {
    const lines = content.split('\n');
    const pathStart = lines.indexOf('## Recommended path');
    const pathEnd = lines.findIndex((line, index) => index > pathStart && line.startsWith('## '));

    expect(pathStart).toBeGreaterThanOrEqual(0);
    expect(pathEnd).toBeGreaterThan(pathStart);

    const pathLines = lines.slice(pathStart + 1, pathEnd);
    const troubleshootingIndex = pathLines.findIndex((line) => line.includes('Troubleshooting'));
    const manualPlanIndex = pathLines.findIndex((line) => line.includes('Manual Test Plan'));
    expect(troubleshootingIndex).toBeGreaterThanOrEqual(0);
    expect(manualPlanIndex).toBeGreaterThan(troubleshootingIndex);
  });

  it('retains existing links (Configuration Reference, Operations Runbook, Troubleshooting)', () => {
    expectContainsAll(content, [
      '[Configuration Reference](./Configuration-Reference.md)',
      '[Operations Runbook](./Operations-Runbook.md)',
      '[Troubleshooting](./Troubleshooting.md)',
    ]);
  });

  it('Manual-Test-Plan link appears in the navigation list section', () => {
    const lines = content.split('\n');
    const navigationStart = lines.indexOf('## Start here');
    const navigationEnd = lines.findIndex(
      (line, index) => index > navigationStart && line.startsWith('## '),
    );

    expect(navigationStart).toBeGreaterThanOrEqual(0);
    expect(navigationEnd).toBeGreaterThan(navigationStart);

    const navigationLines = lines.slice(navigationStart + 1, navigationEnd);
    const listLines = navigationLines.filter(
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

  it('has a top-level heading "Volvox Bot Manual Test Plan"', () => {
    expect(content.split('\n')).toContain('# Volvox Bot Manual Test Plan');
  });

  it('contains a "Last updated" date field', () => {
    expect(content).toContain('Last updated:');
  });

  const requiredSections = [
    'Purpose and Scope',
    'Test Environment Matrix',
    'Test Data and Preconditions',
    'Release Blocking Criteria',
    'End-to-End Test Suites',
    'Negative and Abuse Cases',
    'Accessibility Checklist (Manual)',
    'Performance and Perceived Latency (Manual)',
    'Regression Checklist for Every Release Candidate',
    'Evidence Collection Template',
    'Suggested Execution Cadence',
    'Ownership and Sign-off',
  ];

  for (const section of requiredSections) {
    it(`contains section: ${section}`, () => {
      const sectionHeading = content
        .split('\n')
        .find((line) => line.startsWith('## ') && line.includes(section));

      expect(sectionHeading).toBeDefined();
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

  it('nests suite headings under the end-to-end suites section', () => {
    const suiteHeadings = content.split('\n').filter((line) => line.includes('Suite '));

    expect(suiteHeadings.length).toBeGreaterThanOrEqual(suitesExpected.length);
    expect(suiteHeadings.every((line) => line.startsWith('### Suite '))).toBe(true);
  });

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

    expect(copyLines.length).toBeGreaterThanOrEqual(2);
    expect(copyLines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('<repo>.wiki'),
        expect.stringContaining('volvox-bot.wiki'),
      ]),
    );

    expect(copyLines.every((line) => line.trimStart().startsWith('cp docs/wiki-pages/'))).toBe(
      true,
    );

    for (const line of copyLines) {
      expectContainsAll(line, [
        'Home',
        'Quick-Start',
        'Configuration-Reference',
        'Operations-Runbook',
        'Troubleshooting',
        'Manual-Test-Plan',
        'Changelog',
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

  it('lists Changelog.md in the "Included pages" section', () => {
    expect(content).toContain('`Changelog.md`');
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/Home.md — Changelog link
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/Home.md — Changelog link', () => {
  const homePath = join(wikiRoot, 'Home.md');
  let content;

  beforeAll(() => {
    content = readText(homePath);
  });

  it('contains a link to Changelog', () => {
    expect(content).toContain('[Changelog](./Changelog.md)');
  });

  it('Changelog link appears in the "Start here" navigation list', () => {
    const lines = content.split('\n');
    const navigationStart = lines.indexOf('## Start here');
    const navigationEnd = lines.findIndex(
      (line, index) => index > navigationStart && line.startsWith('## '),
    );

    expect(navigationStart).toBeGreaterThanOrEqual(0);
    expect(navigationEnd).toBeGreaterThan(navigationStart);

    const navigationLines = lines.slice(navigationStart + 1, navigationEnd);
    const changelogLines = navigationLines.filter(
      (line) => line.trimStart().startsWith('-') && line.includes('Changelog'),
    );
    expect(changelogLines.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/Changelog.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/Changelog.md', () => {
  const changelogPath = join(wikiRoot, 'Changelog.md');
  const weekHeadingPattern = /^## Week \d{4}-W\d{2}/;
  let content;

  beforeAll(() => {
    content = readText(changelogPath);
  });

  it('file exists', () => {
    expect(existsSync(changelogPath)).toBe(true);
  });

  it('has a top-level "# Volvox.Bot Changelog" heading', () => {
    expect(content.split('\n')).toContain('# Volvox.Bot Changelog');
  });

  it('contains an introductory paragraph linking to the Mintlify changelog', () => {
    expect(content).toContain('https://volvox.bot/changelog');
  });

  it('has at least one weekly section using ## Week YYYY-W## format', () => {
    const weeklyHeadings = content.split('\n').filter((line) => weekHeadingPattern.test(line));
    expect(weeklyHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it('weekly section headings include a date range in parentheses', () => {
    const weeklyHeadings = content.split('\n').filter((line) => weekHeadingPattern.test(line));
    expect(weeklyHeadings.length).toBeGreaterThanOrEqual(1);
    for (const heading of weeklyHeadings) {
      expect(heading).toMatch(/^## Week \d{4}-W\d{2} \(.+\)$/);
    }
  });

  it('each weekly section contains bullet-point change entries', () => {
    const lines = content.split('\n');
    const weeklyHeadingIndices = lines.reduce((indices, line, index) => {
      if (weekHeadingPattern.test(line)) {
        indices.push(index);
      }
      return indices;
    }, []);
    expect(weeklyHeadingIndices.length).toBeGreaterThanOrEqual(1);

    for (const [index, headingIndex] of weeklyHeadingIndices.entries()) {
      const nextHeadingIndex = weeklyHeadingIndices[index + 1] ?? lines.length;
      const sectionLines = lines.slice(headingIndex + 1, nextHeadingIndex);
      const bulletLines = sectionLines.filter((line) => line.startsWith('- **'));
      expect(bulletLines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('is non-empty and has meaningful length', () => {
    expect(content.length).toBeGreaterThan(200);
  });

  it('uses plain Markdown only — no MDX <Update> components', () => {
    expect(content).not.toContain('<Update');
  });
});
