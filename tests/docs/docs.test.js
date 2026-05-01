import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, '..', '..', 'docs');
const wikiRoot = join(docsRoot, 'wiki-pages');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readText(filePath) {
  return readFileSync(filePath, 'utf-8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
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

// ---------------------------------------------------------------------------
// docs/docs.json
// ---------------------------------------------------------------------------

describe('docs/docs.json', () => {
  const docsJsonPath = join(docsRoot, 'docs.json');
  let config;

  it('file exists', () => {
    expect(existsSync(docsJsonPath)).toBe(true);
  });

  it('is valid JSON', () => {
    config = readJson(docsJsonPath);
    expect(typeof config).toBe('object');
    expect(config).not.toBeNull();
  });

  it('has $schema field pointing to mintlify', () => {
    config = readJson(docsJsonPath);
    expect(config).toHaveProperty('$schema');
    expect(config.$schema).toContain('mintlify');
  });

  it('has navigation.tabs array', () => {
    config = readJson(docsJsonPath);
    expect(config).toHaveProperty('navigation');
    expect(config.navigation).toHaveProperty('tabs');
    expect(Array.isArray(config.navigation.tabs)).toBe(true);
    expect(config.navigation.tabs.length).toBeGreaterThan(0);
  });

  it('includes "manual-test-plan" in the Support tab Help group pages', () => {
    config = readJson(docsJsonPath);
    const tabs = config.navigation.tabs;
    const supportTab = tabs.find(
      (t) => t.tab === 'Support' || getAllPages([t]).includes('manual-test-plan'),
    );
    expect(supportTab).toBeDefined();

    const helpGroup = supportTab.groups?.find((g) => g.group === 'Help');
    expect(helpGroup).toBeDefined();
    expect(helpGroup.pages).toContain('manual-test-plan');
  });

  it('"manual-test-plan" is listed after "help" in the Help group pages', () => {
    config = readJson(docsJsonPath);
    const tabs = config.navigation.tabs;
    const helpGroup = tabs
      .flatMap((t) => t.groups ?? [])
      .find((g) => g.group === 'Help');

    const helpIdx = helpGroup.pages.indexOf('help');
    const planIdx = helpGroup.pages.indexOf('manual-test-plan');
    expect(helpIdx).toBeGreaterThanOrEqual(0);
    expect(planIdx).toBeGreaterThan(helpIdx);
  });

  it('the Help group contains exactly the expected pages', () => {
    config = readJson(docsJsonPath);
    const tabs = config.navigation.tabs;
    const helpGroup = tabs
      .flatMap((t) => t.groups ?? [])
      .find((g) => g.group === 'Help');

    expect(helpGroup.pages).toEqual(['faq', 'security', 'help', 'manual-test-plan']);
  });

  it('does not duplicate "manual-test-plan" across all pages', () => {
    config = readJson(docsJsonPath);
    const allPages = getAllPages(config.navigation.tabs);
    const occurrences = allPages.filter((p) => p === 'manual-test-plan').length;
    expect(occurrences).toBe(1);
  });

  it('retains existing core page entries', () => {
    config = readJson(docsJsonPath);
    const allPages = getAllPages(config.navigation.tabs);
    for (const page of ['introduction', 'faq', 'security', 'help', 'changelog']) {
      expect(allPages).toContain(page);
    }
  });
});

// ---------------------------------------------------------------------------
// docs/manual-test-plan.mdx
// ---------------------------------------------------------------------------

describe('docs/manual-test-plan.mdx', () => {
  const mdxPath = join(docsRoot, 'manual-test-plan.mdx');
  let content;

  it('file exists', () => {
    expect(existsSync(mdxPath)).toBe(true);
    content = readText(mdxPath);
  });

  it('has a YAML frontmatter block', () => {
    content = readText(mdxPath);
    expect(content.startsWith('---')).toBe(true);
    const closingFence = content.indexOf('---', 3);
    expect(closingFence).toBeGreaterThan(3);
  });

  it('frontmatter contains title "Manual Test Plan"', () => {
    content = readText(mdxPath);
    expect(content).toContain('title: "Manual Test Plan"');
  });

  it('frontmatter contains a non-empty description', () => {
    content = readText(mdxPath);
    const match = content.match(/description:\s*"(.+?)"/);
    expect(match).not.toBeNull();
    expect(match[1].trim().length).toBeGreaterThan(0);
  });

  it('has a top-level # Manual Test Plan heading', () => {
    content = readText(mdxPath);
    expect(content).toMatch(/^# Manual Test Plan$/m);
  });

  it('contains link to the wiki source on GitHub', () => {
    content = readText(mdxPath);
    expect(content).toContain(
      'https://github.com/VolvoxLLC/volvox-bot/blob/main/docs/wiki-pages/Manual-Test-Plan.md',
    );
  });

  it('has a "What it covers" section', () => {
    content = readText(mdxPath);
    expect(content).toContain('## What it covers');
  });

  it('"What it covers" lists environment matrix and persona setup', () => {
    content = readText(mdxPath);
    expect(content).toContain('Environment matrix and persona setup');
  });

  it('"What it covers" lists preconditions and release-blocking criteria', () => {
    content = readText(mdxPath);
    expect(content).toContain('Preconditions and release-blocking criteria');
  });

  it('"What it covers" lists end-to-end suites', () => {
    content = readText(mdxPath);
    expect(content).toContain('End-to-end suites');
  });

  it('"What it covers" lists negative/abuse testing', () => {
    content = readText(mdxPath);
    expect(content).toContain('Negative/abuse testing');
  });

  it('"What it covers" lists accessibility and performance spot checks', () => {
    content = readText(mdxPath);
    expect(content).toContain('Accessibility and performance spot checks');
  });

  it('"What it covers" lists evidence collection and sign-off ownership', () => {
    content = readText(mdxPath);
    expect(content).toContain('Evidence collection and sign-off ownership');
  });

  it('has a "Publish to GitHub Wiki" section', () => {
    content = readText(mdxPath);
    expect(content).toContain('## Publish to GitHub Wiki');
  });

  it('instructs to include Manual-Test-Plan.md when publishing', () => {
    content = readText(mdxPath);
    expect(content).toContain('Manual-Test-Plan.md');
  });

  it('file is non-empty and has meaningful length', () => {
    content = readText(mdxPath);
    expect(content.length).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/Home.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/Home.md', () => {
  const homePath = join(wikiRoot, 'Home.md');
  let content;

  it('file exists', () => {
    expect(existsSync(homePath)).toBe(true);
    content = readText(homePath);
  });

  it('contains a link to Manual-Test-Plan', () => {
    content = readText(homePath);
    expect(content).toContain('[Manual Test Plan](Manual-Test-Plan)');
  });

  it('includes Manual-Test-Plan in the recommended path steps', () => {
    content = readText(homePath);
    expect(content).toContain('Manual Test Plan');
    // The recommended-path step should mention release candidates
    expect(content).toContain('release candidate');
  });

  it('recommended path step for Manual-Test-Plan is numbered 5', () => {
    content = readText(homePath);
    const lines = content.split('\n');
    const step5 = lines.find(
      (l) => l.startsWith('5.') && l.includes('Manual Test Plan'),
    );
    expect(step5).toBeDefined();
  });

  it('retains existing links (Configuration Reference, Operations Runbook, Troubleshooting)', () => {
    content = readText(homePath);
    expect(content).toContain('[Configuration Reference](Configuration-Reference)');
    expect(content).toContain('[Operations Runbook](Operations-Runbook)');
    expect(content).toContain('[Troubleshooting](Troubleshooting)');
  });

  it('Manual-Test-Plan link appears in the navigation list section', () => {
    content = readText(homePath);
    // The link should appear in a markdown list item
    const listLines = content
      .split('\n')
      .filter((l) => l.trimStart().startsWith('-') && l.includes('Manual-Test-Plan'));
    expect(listLines.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/Manual-Test-Plan.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/Manual-Test-Plan.md', () => {
  const planPath = join(wikiRoot, 'Manual-Test-Plan.md');
  let content;

  it('file exists', () => {
    expect(existsSync(planPath)).toBe(true);
    content = readText(planPath);
  });

  it('has a top-level heading "Volvox.Bot Manual Test Plan"', () => {
    content = readText(planPath);
    expect(content).toMatch(/^# Volvox\.Bot Manual Test Plan$/m);
  });

  it('contains a "Last updated" date field', () => {
    content = readText(planPath);
    expect(content).toMatch(/Last updated:/);
  });

  // Verify all 12 numbered sections are present
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
      content = readText(planPath);
      expect(content).toContain(section);
    });
  }

  // Verify all test suites A–O are present
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
      content = readText(planPath);
      expect(content).toContain(suite);
    });
  }

  it('section 2 describes at least 3 environments (local, staging, production)', () => {
    content = readText(planPath);
    expect(content).toContain('Local development');
    expect(content).toContain('Staging');
    expect(content).toContain('Production smoke check');
  });

  it('section 2 defines at least 3 Discord test guilds', () => {
    content = readText(planPath);
    expect(content).toContain('Guild A');
    expect(content).toContain('Guild B');
    expect(content).toContain('Guild C');
  });

  it('section 2 defines at least 4 user personas', () => {
    content = readText(planPath);
    expect(content).toContain('Server owner/admin');
    expect(content).toContain('Moderator');
    expect(content).toContain('Normal member');
    expect(content).toContain('User missing required permissions');
  });

  it('section 4 specifies release-blocking criteria for uncaught errors', () => {
    content = readText(planPath);
    expect(content).toContain('uncaught errors');
  });

  it('section 4 specifies release-blocking criteria for permission checks', () => {
    content = readText(planPath);
    expect(content).toContain('Permission checks');
  });

  it('Suite D lists core moderation commands', () => {
    content = readText(planPath);
    expect(content).toContain('warn');
    expect(content).toContain('kick');
    expect(content).toContain('ban');
    expect(content).toContain('purge');
  });

  it('Suite H covers AI/conversation feature gating', () => {
    content = readText(planPath);
    expect(content).toContain('AI feature flag');
  });

  it('section 6 lists negative/abuse input categories', () => {
    content = readText(planPath);
    expect(content).toContain('Oversized inputs');
    expect(content).toContain('Invalid IDs/mentions');
    expect(content).toContain('Markdown/formatting injection');
  });

  it('section 7 accessibility checklist includes keyboard navigation', () => {
    content = readText(planPath);
    expect(content).toContain('Keyboard-only navigation');
  });

  it('section 9 regression checklist includes a smoke check', () => {
    content = readText(planPath);
    expect(content).toContain('Smoke:');
  });

  it('section 10 evidence template includes severity and release impact fields', () => {
    content = readText(planPath);
    expect(content).toContain('Severity and release impact');
  });

  it('section 11 defines per-PR, pre-release RC, post-release, and monthly cadence', () => {
    content = readText(planPath);
    expect(content).toContain('Per PR');
    expect(content).toContain('Pre-release RC');
    expect(content).toContain('Post-release');
    expect(content).toContain('Monthly hardening pass');
  });

  it('section 12 names sign-off roles including QA/Tester and Operations owner', () => {
    content = readText(planPath);
    expect(content).toContain('QA/Tester');
    expect(content).toContain('Operations owner');
  });

  it('is a substantial document (>5000 characters)', () => {
    content = readText(planPath);
    expect(content.length).toBeGreaterThan(5000);
  });
});

// ---------------------------------------------------------------------------
// docs/wiki-pages/README.md
// ---------------------------------------------------------------------------

describe('docs/wiki-pages/README.md', () => {
  const readmePath = join(wikiRoot, 'README.md');
  let content;

  it('file exists', () => {
    expect(existsSync(readmePath)).toBe(true);
    content = readText(readmePath);
  });

  it('lists Manual-Test-Plan.md in the "Included pages" section', () => {
    content = readText(readmePath);
    expect(content).toContain('`Manual-Test-Plan.md`');
  });

  it('generic copy command includes Manual-Test-Plan in the brace expansion', () => {
    content = readText(readmePath);
    // Should include Manual-Test-Plan in the bash brace expansion
    expect(content).toMatch(/\{[^}]*Manual-Test-Plan[^}]*\}\.md/);
  });

  it('project-specific copy command for VolvoxLLC includes Manual-Test-Plan', () => {
    content = readText(readmePath);
    const volvoxLines = content
      .split('\n')
      .filter((l) => l.includes('volvox-bot.wiki') && l.includes('Manual-Test-Plan'));
    expect(volvoxLines.length).toBeGreaterThanOrEqual(1);
  });

  it('both copy commands include all original pages alongside Manual-Test-Plan', () => {
    content = readText(readmePath);
    const copyLines = content
      .split('\n')
      .filter((l) => l.trimStart().startsWith('cp') && l.includes('Manual-Test-Plan'));

    for (const line of copyLines) {
      expect(line).toContain('Home');
      expect(line).toContain('Quick-Start');
      expect(line).toContain('Configuration-Reference');
      expect(line).toContain('Operations-Runbook');
      expect(line).toContain('Troubleshooting');
      expect(line).toContain('Manual-Test-Plan');
    }
  });

  it('states that README.md itself is excluded from the published wiki', () => {
    content = readText(readmePath);
    expect(content).toContain('README.md');
    expect(content).toContain('excluded from the published wiki');
  });

  it('retains all original pages in the included pages list', () => {
    content = readText(readmePath);
    for (const page of [
      '`Home.md`',
      '`Quick-Start.md`',
      '`Configuration-Reference.md`',
      '`Operations-Runbook.md`',
      '`Troubleshooting.md`',
    ]) {
      expect(content).toContain(page);
    }
  });

  // Regression: ensure the page count in the copy commands didn't regress
  it('generic copy command brace expansion contains exactly 6 page names', () => {
    content = readText(readmePath);
    const genericLine = content
      .split('\n')
      .find(
        (l) =>
          l.trimStart().startsWith('cp') &&
          l.includes('<repo>.wiki') &&
          l.includes('Manual-Test-Plan'),
      );
    expect(genericLine).toBeDefined();
    // Extract brace content
    const braceMatch = genericLine.match(/\{([^}]+)\}/);
    expect(braceMatch).not.toBeNull();
    const names = braceMatch[1].split(',');
    expect(names).toHaveLength(6);
  });
});
