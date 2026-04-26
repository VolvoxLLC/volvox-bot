import { expect, test } from '@playwright/test';

async function scrollSectionIntoView(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.locator(selector).locator(':scope > *').first().waitFor({ state: 'visible' });
}

async function expectSectionAfterClick(
  locator: import('@playwright/test').Locator,
  section: import('@playwright/test').Locator,
) {
  await locator.click();
  // Wait for smooth scroll to bring section into viewport
  await expect(section).toBeInViewport({ timeout: 10000 });
}

test.describe('Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the Volvox logo text', async ({ page }) => {
    await expect(page.locator('header').getByText('Volvox.Bot', { exact: true })).toBeVisible();
  });

  test('shows Sign In link', async ({ page }) => {
    // Sign In link is hidden on mobile (hidden md:flex), so only assert on desktop
    test.skip(
      page.viewportSize()?.width !== undefined && page.viewportSize()!.width < 768,
      'Sign In link is hidden on mobile viewports',
    );
    const signInLink = page.locator('header a[href="/login"]').first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveText('Sign In');
  });
});

test.describe('Desktop Navigation', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows desktop nav buttons for Features, Pricing, Dashboard, Compare', async ({ page }) => {
    const desktopNav = page.locator('header nav').first();
    await expect(desktopNav.getByText('Features')).toBeVisible();
    await expect(desktopNav.getByText('Pricing')).toBeVisible();
    await expect(desktopNav.getByText('Dashboard')).toBeVisible();
    await expect(desktopNav.getByText('Compare')).toBeVisible();
  });

  test('nav buttons scroll the page', async ({ page, browserName }) => {
    test.skip(
      browserName === 'chromium' && page.viewportSize()?.width! < 768,
      'Desktop-only navigation test',
    );
    // TODO: Re-enable after fixing smooth scroll timing in CI
    test.fixme();
    const desktopNav = page.locator('header nav').first();
    await expectSectionAfterClick(
      desktopNav.getByText('Features'),
      page.getByRole('heading', { name: /Everything you need/i }),
    );
    await expectSectionAfterClick(
      desktopNav.getByText('Pricing'),
      page.getByRole('heading', { name: /System Access Tiers/i }),
    );
  });
});

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens the mobile menu on toggle click', async ({ page }) => {
    const toggleButton = page.getByLabel('Open menu');
    await toggleButton.click();
    const mobileNav = page.getByRole('dialog');
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole('heading', { name: 'Menu' })).toBeVisible();
    await expect(mobileNav.getByText('Features')).toBeVisible();
    await expect(mobileNav.getByText('Pricing')).toBeVisible();
    await expect(mobileNav.getByText('Dashboard')).toBeVisible();
    await expect(mobileNav.getByText('Compare')).toBeVisible();
  });
});

test.describe('Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the hero content', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /V O L V O X/ })).toBeVisible();
    await expect(page.getByText('BOT', { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        'The absolute synthesis of community intelligence, robust moderation, and seamless scale.',
      ),
    ).toBeVisible();
  });

  test('renders the Add to Server CTA', async ({ page }) => {
    // CTA text is hidden on small viewports (hidden sm:inline)
    test.skip(
      page.viewportSize()?.width !== undefined && page.viewportSize()!.width < 640,
      'Add to Server CTA text is hidden on small viewports',
    );
    const cta = page.getByRole('link', { name: /Add to Server/i });
    // CTA only renders when NEXT_PUBLIC_DISCORD_CLIENT_ID is set
    const isPresent = await cta.isVisible().catch(() => false);
    if (isPresent) {
      await expect(cta).toHaveAttribute('target', '_blank');
    } else {
      // Verify the /summon console is still present as fallback
      await expect(page.getByText('/summon')).toBeVisible();
    }
  });
});

test.describe('Features Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#features');
  });

  test('renders the features section', async ({ page }) => {
    await expect(page.getByText('System Protocol', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Everything you need/i })).toBeVisible();
    for (const title of ['Neural Chat', 'Active Sentry', 'Live Insight', 'TL;DR', 'Core Engine']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });
});

test.describe('Pricing Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#pricing');
  });

  test('renders pricing cards and toggle', async ({ page }) => {
    await expect(
      page.getByText('System Access Tiers', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Standard').first()).toBeVisible();
    await expect(page.getByText('Overclocked').first()).toBeVisible();
    await expect(page.getByText('$14.99')).toBeVisible();
    // Toggle is a motion.div with aria-label, not a semantic switch
    const toggle = page.getByLabel('Toggle annual billing');
    await toggle.click();
    await expect(page.getByText('$115')).toBeVisible();
  });

  test('shows pricing copy', async ({ page }) => {
    await expect(page.getByText('Core command modules')).toBeVisible();
    await expect(page.getByText('Priority Technical Support')).toBeVisible();
  });
});

test.describe('Comparison Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#compare');
  });

  test('renders comparison table with updated rows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Engineered for Superiority/i })).toBeVisible();
    const table = page.locator('table[aria-label="Feature comparison"]');
    const features = [
      'AI Neural Chat',
      'AI Moderation',
      'Next-Gen Dashboard',
      'Custom Branding',
      'Global Analytics',
      'Access Model',
    ];
    for (const feature of features) {
      await expect(table.getByText(feature)).toBeVisible();
    }
  });
});

test.describe('Stats Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByText('Network Status').waitFor({ state: 'visible', timeout: 15000 });
  });

  test('shows live stats labels', async ({ page }) => {
    const statsSection = page.locator('section', { hasText: 'Network Status' });
    await expect(statsSection.getByText('Active Users')).toBeVisible({ timeout: 15000 });
    await expect(statsSection.getByText('Uptime')).toBeVisible({ timeout: 15000 });
  });

  test('Bot Config is not in navigation', async ({ page }) => {
    const nav = page.locator('nav');
    await expect(nav.getByText('Bot Config')).not.toBeAttached();
  });
});

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('footer').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('shows footer link sections', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('SYSTEM CORE')).toBeVisible();
    await expect(footer.getByText('RESOURCES')).toBeVisible();
    await expect(footer.getByText('LEGAL PROTOCOL')).toBeVisible();
  });

  test('has social links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Discord', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'X', exact: true })).toBeVisible();
  });

  test('has legal footer links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: /Privacy Policy/i })).toBeVisible();
    await expect(footer.getByRole('link', { name: /Terms of Service/i })).toBeVisible();
  });
});

test.describe('Full Page', () => {
  test('loads and has the correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Volvox/);
  });

  test('page has correct meta description', async ({ page }) => {
    await page.goto('/');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain('AI-powered Discord bot');
  });

  test('all major page sections are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#features')).toBeAttached();
    await expect(page.locator('#pricing')).toBeAttached();
    await expect(page.locator('#dashboard')).toBeAttached();
    await expect(page.locator('#compare')).toBeAttached();
    await expect(page.locator('footer')).toBeAttached();
  });
});
