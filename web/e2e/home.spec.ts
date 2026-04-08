import { expect, test } from '@playwright/test';

async function scrollSectionIntoView(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.locator(selector).locator(':scope > *').first().waitFor({ state: 'visible' });
}

async function expectScrollAfterClick(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await locator.click();
  await page.waitForFunction((prevY) => window.scrollY > prevY, scrollBefore, { timeout: 5000 });
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
}

test.describe('Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the Volvox logo text', async ({ page }) => {
    await expect(page.locator('header').getByText('Volvox', { exact: true })).toBeVisible();
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

  test('nav buttons scroll the page', async ({ page }) => {
    const desktopNav = page.locator('header nav').first();
    await expectScrollAfterClick(page, desktopNav.getByText('Features'));
    await page.goto('/');
    await expectScrollAfterClick(page, desktopNav.getByText('Pricing'));
  });
});

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens the mobile menu on toggle click', async ({ page }) => {
    const toggleButton = page.getByLabel('Toggle menu');
    await toggleButton.click();
    const mobileNav = page.locator('#mobile-nav');
    await expect(mobileNav).toBeVisible();
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

  test('displays the redesigned hero content', async ({ page }) => {
    await expect(page.getByText('Autonomous Community Intelligence')).toBeVisible();
    await expect(page.getByRole('heading', { name: /OF DISCORD\./ })).toBeVisible();
    await expect(
      page.getByText('Volvox is an AI-powered command center for modern communities.'),
    ).toBeVisible();
  });

  test('renders the Explore Features CTA', async ({ page }) => {
    const cta = page.getByRole('link', { name: 'Explore Features' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/#features');
  });
});

test.describe('Features Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#features');
  });

  test('renders the redesigned features section', async ({ page }) => {
    await expect(page.getByText('System Capabilities', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Everything you need/i })).toBeVisible();
    for (const title of ['Neural Chat', 'Active Sentry', 'Live Insight', 'Edge Performance']) {
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
    await expect(page.getByRole('heading', { name: 'Simple, transparent pricing' })).toBeVisible();
    await expect(page.getByText('PRICING', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
    await expect(page.getByText('$14.99')).toBeVisible();
    const toggle = page.getByRole('switch', { name: 'Toggle annual billing' });
    await toggle.click();
    await expect(page.getByText('$115')).toBeVisible();
  });

  test('shows updated pricing copy', async ({ page }) => {
    await expect(page.getByText('Core bot features')).toBeVisible();
    await expect(page.getByText('Community support')).toBeVisible();
    await expect(page.getByText('No credit card required for Free tier.')).toBeVisible();
  });
});

test.describe('Comparison Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#compare');
  });

  test('renders comparison table with updated rows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Engineered for Superiority/i })).toBeVisible();
    const table = page.locator('[role="table"]');
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
    await page.getByRole('heading', { name: /Loved by/ }).waitFor({ state: 'visible', timeout: 15000 });
  });

  test('shows live stats labels', async ({ page }) => {
    const statsSection = page.locator('section', { hasText: 'Loved by' });
    await expect(statsSection.getByText('Commands Served')).toBeVisible({ timeout: 15000 });
    await expect(statsSection.getByText('Uptime', { exact: true })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('footer').waitFor({ state: 'visible', timeout: 10000 });
  });

  test('shows Product, Resources, and Company footer sections', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('Product')).toBeVisible();
    await expect(footer.getByText('Resources')).toBeVisible();
    await expect(footer.getByText('Company')).toBeVisible();
  });

  test('has updated social links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByLabel('GitHub')).toBeVisible();
    await expect(footer.getByLabel('Discord')).toBeVisible();
    await expect(footer.getByLabel('X (Twitter)')).toBeVisible();
    await expect(footer.getByLabel('LinkedIn')).toBeVisible();
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
