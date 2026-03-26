import { expect, test } from '@playwright/test';

/**
 * E2E tests for the Volvox landing / home page.
 *
 * Covers the full page flow rendered by `web/src/app/page.tsx`:
 *   Header → Hero → Dashboard Showcase → Comparison → Features → Pricing → Stats → Footer
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Scroll a section into the center of the viewport so framer-motion's
 * `useInView` triggers and content actually renders. Waits for the
 * section's first heading or text to become visible before returning.
 */
async function scrollSectionIntoView(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  // Wait for framer-motion's IntersectionObserver callback to fire and trigger animations
  await page.locator(selector).locator(':scope > *').first().waitFor({ state: 'visible' });
}

/**
 * Click a navigation button and verify the page scrolled from the current position.
 * Uses `page.waitForFunction` instead of a hard-coded timeout.
 */
async function expectScrollAfterClick(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
) {
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await locator.click();
  await page.waitForFunction(
    (prevY) => window.scrollY > prevY,
    scrollBefore,
    { timeout: 5000 },
  );
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
}

// ─── Header / Navbar ─────────────────────────────────────────────────────────

test.describe('Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the Volvox logo text', async ({ page }) => {
    const logo = page.locator('header').getByText('Volvox', { exact: true });
    await expect(logo).toBeVisible();
  });

  test('displays the V logo mark', async ({ page }) => {
    const logoMark = page.locator('header').locator('div', { hasText: /^V$/ }).first();
    await expect(logoMark).toBeVisible();
  });
});

// ─── Desktop Navigation ──────────────────────────────────────────────────────

test.describe('Desktop Navigation', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the Sign In link pointing to /login', async ({ page }) => {
    const signInLink = page.locator('header a[href="/login"]').first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveText('Sign In');
  });

  test('shows desktop nav buttons for Features, Pricing, Dashboard, Compare', async ({
    page,
  }) => {
    const desktopNav = page.locator('header nav').first();
    await expect(desktopNav.getByText('Features')).toBeVisible();
    await expect(desktopNav.getByText('Pricing')).toBeVisible();
    await expect(desktopNav.getByText('Dashboard')).toBeVisible();
    await expect(desktopNav.getByText('Compare')).toBeVisible();
  });

  test('clicking Features nav scrolls the page', async ({ page }) => {
    const desktopNav = page.locator('header nav').first();
    await expectScrollAfterClick(page, desktopNav.getByText('Features'));
  });

  test('clicking Pricing nav scrolls the page', async ({ page }) => {
    const desktopNav = page.locator('header nav').first();
    await expectScrollAfterClick(page, desktopNav.getByText('Pricing'));
  });

  test('clicking Dashboard nav scrolls the page', async ({ page }) => {
    const desktopNav = page.locator('header nav').first();
    await expectScrollAfterClick(page, desktopNav.getByText('Dashboard'));
  });

  test('clicking Compare nav scrolls the page', async ({ page }) => {
    const desktopNav = page.locator('header nav').first();
    await expectScrollAfterClick(page, desktopNav.getByText('Compare'));
  });
});

// ─── Mobile Navigation ───────────────────────────────────────────────────────

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows the mobile menu toggle button', async ({ page }) => {
    const toggleButton = page.getByLabel('Toggle menu');
    await expect(toggleButton).toBeVisible();
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

  test('closes the mobile menu and scrolls when nav item is clicked', async ({ page }) => {
    const toggleButton = page.getByLabel('Toggle menu');
    await toggleButton.click();

    const mobileNav = page.locator('#mobile-nav');
    await expect(mobileNav).toBeVisible();

    await mobileNav.getByText('Features').click();
    // Menu should close
    await expect(mobileNav).not.toBeVisible();
  });

  test('contains a Sign In link in the mobile menu', async ({ page }) => {
    const toggleButton = page.getByLabel('Toggle menu');
    await toggleButton.click();

    const mobileNav = page.locator('#mobile-nav');
    const signInLink = mobileNav.locator('a[href="/login"]');
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveText('Sign In');
  });
});

// ─── Hero Section ────────────────────────────────────────────────────────────

test.describe('Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the hero section', async ({ page }) => {
    const heroSection = page.locator('section').first();
    await expect(heroSection).toBeVisible();
  });

  test('displays the "Building the future of Discord communities" badge', async ({ page }) => {
    const badge = page.getByText('Building the future of Discord communities');
    await expect(badge).toBeVisible();
  });

  test('shows the typewriter headline that types "volvox-bot"', async ({ page }) => {
    const headline = page.locator('h1');
    await expect(headline).toContainText('volvox-bot', { timeout: 10_000 });
  });

  test('shows "AI-powered Discord." after typewriter completes', async ({ page }) => {
    const aiText = page.getByText('AI-powered Discord.');
    await expect(aiText).toBeVisible({ timeout: 10_000 });
  });

  test('shows the hero subheadline text', async ({ page }) => {
    const subheadline = page.getByText('A software-powered bot for modern communities');
    await expect(subheadline).toBeVisible({ timeout: 10_000 });
  });

  test('renders the "Open Dashboard" CTA button linking to /login', async ({ page }) => {
    const dashboardCta = page.getByRole('link', { name: 'Open Dashboard' });
    await expect(dashboardCta).toBeVisible({ timeout: 10_000 });
    await expect(dashboardCta).toHaveAttribute('href', '/login');
  });

  test('renders the chat console with #general channel indicator', async ({ page }) => {
    const channelIndicator = page.getByText('#general');
    await expect(channelIndicator).toBeVisible({ timeout: 10_000 });
  });

  test('renders the "Live" indicator in the chat console', async ({ page }) => {
    const liveIndicator = page.getByText('Live', { exact: true });
    await expect(liveIndicator).toBeVisible({ timeout: 10_000 });
  });

  test('shows "Type a message..." placeholder in chat input', async ({ page }) => {
    const placeholder = page.getByText('Type a message...');
    await expect(placeholder).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Features Section ────────────────────────────────────────────────────────

test.describe('Features Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#features');
  });

  test('renders the features section heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Everything you need' });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('renders the "FEATURES" label', async ({ page }) => {
    const label = page.getByText('FEATURES', { exact: true });
    await expect(label).toBeVisible();
  });

  test('displays all four feature cards', async ({ page }) => {
    const featureTitles = ['AI Chat', 'Moderation', 'Starboard', 'Analytics'];
    for (const title of featureTitles) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
    }
  });

  test('each feature card has a description', async ({ page }) => {
    await expect(page.getByText('Reply in-channel with Claude')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Claude-backed detection')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Best posts become a running')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Track server health from the dashboard')).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── Pricing Section ─────────────────────────────────────────────────────────

test.describe('Pricing Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#pricing');
  });

  test('renders the pricing section heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Simple, transparent pricing' });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('renders the "PRICING" label', async ({ page }) => {
    const label = page.getByText('PRICING', { exact: true });
    await expect(label).toBeVisible();
  });

  test('shows the Free tier card', async ({ page }) => {
    const freeHeading = page.getByRole('heading', { name: 'Free' });
    await expect(freeHeading).toBeVisible({ timeout: 10_000 });
  });

  test('shows the Pro tier card with "Most Popular" badge', async ({ page }) => {
    const proHeading = page.getByRole('heading', { name: 'Pro', exact: true });
    await expect(proHeading).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Most Popular')).toBeVisible({ timeout: 10_000 });
  });

  test('displays the Free tier price of $0', async ({ page }) => {
    await expect(page.getByText('$0')).toBeVisible({ timeout: 10_000 });
  });

  test('displays the Pro monthly price of $14.99', async ({ page }) => {
    await expect(page.getByText('$14.99')).toBeVisible({ timeout: 10_000 });
  });

  test('billing toggle switches between monthly and annual', async ({ page }) => {
    // Default is monthly — verify $14.99 is shown
    await expect(page.getByText('$14.99')).toBeVisible({ timeout: 10_000 });

    // Click the annual toggle
    const toggle = page.getByRole('switch', { name: 'Toggle annual billing' });
    await toggle.click();

    // Should now show annual price
    await expect(page.getByText('$115')).toBeVisible({ timeout: 5_000 });
  });

  test('shows "Save 36%" label next to annual toggle', async ({ page }) => {
    await expect(page.getByText('Save 36%')).toBeVisible({ timeout: 10_000 });
  });

  test('shows Free tier features list', async ({ page }) => {
    await expect(page.getByText('Core bot features')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1 Discord server')).toBeVisible();
    await expect(page.getByText('Community support')).toBeVisible();
    await expect(page.getByText('Self-hosted option')).toBeVisible();
  });

  test('shows Pro tier features list', async ({ page }) => {
    await expect(page.getByText('Everything in Free')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Up to 3 servers')).toBeVisible();
    await expect(page.getByText('AI chat (100 msgs/day)')).toBeVisible();
    await expect(page.getByText('Analytics dashboard')).toBeVisible();
  });

  test('shows footer note about self-hosting', async ({ page }) => {
    await expect(
      page.getByText('All plans include open-source self-hosting option'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Free tier CTA links to GitHub repo', async ({ page }) => {
    const getStartedLink = page.getByRole('link', { name: 'Get Started' });
    await expect(getStartedLink).toBeVisible({ timeout: 10_000 });
    await expect(getStartedLink).toHaveAttribute(
      'href',
      'https://github.com/VolvoxLLC/volvox-bot',
    );
  });
});

// ─── Comparison Table Section ────────────────────────────────────────────────

test.describe('Comparison Table', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#compare');
  });

  test('renders the comparison section heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Compare the alternatives' });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('renders the "WHY VOLVOX" label', async ({ page }) => {
    const label = page.getByText('WHY VOLVOX', { exact: true });
    await expect(label).toBeVisible();
  });

  test('shows column headers for Volvox, MEE6, Dyno, Carl-bot', async ({ page }) => {
    const table = page.locator('table');
    await expect(table.getByText('Volvox')).toBeVisible({ timeout: 10_000 });
    await expect(table.getByText('MEE6')).toBeVisible();
    await expect(table.getByText('Dyno')).toBeVisible();
    await expect(table.getByText('Carl-bot')).toBeVisible();
  });

  test('shows comparison feature rows', async ({ page }) => {
    const features = [
      'AI Chat',
      'AI Moderation',
      'Open Source',
      'Self-Hostable',
      'Web Dashboard',
      'Starboard',
      'Analytics',
      'Free Tier',
    ];
    for (const feature of features) {
      await expect(
        page.locator('table td').filter({ hasText: feature }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

// ─── Dashboard Showcase Section ──────────────────────────────────────────────

test.describe('Dashboard Showcase', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#dashboard');
  });

  test('renders the "THE PRODUCT" label', async ({ page }) => {
    const label = page.getByText('THE PRODUCT', { exact: true });
    await expect(label).toBeVisible({ timeout: 10_000 });
  });

  test('renders the section heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Your server, at a glance' });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Stats / Testimonials Section ────────────────────────────────────────────

test.describe('Stats Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for the section heading to render (signals IntersectionObserver fired)
    await page.getByRole('heading', { name: /Loved by/ }).waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('renders the "Loved by developers" heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /Loved by/ });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('shows the "Live data" indicator', async ({ page }) => {
    await expect(page.getByText('Live data · refreshed every minute')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('shows stat labels after data loads', async ({ page }) => {
    // Stats labels only appear once the /api/stats fetch completes (loading → error/success).
    // Scope to the stats section (which contains "Loved by developers") to avoid matching
    // the Dashboard Showcase section which also displays "Commands Served".
    const statsSection = page.locator('section', { hasText: 'Loved by' });
    await expect(statsSection.getByText('Commands Served')).toBeVisible({ timeout: 15_000 });
    await expect(statsSection.getByText('Uptime', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('renders testimonial cards', async ({ page }) => {
    const testimonialCards = page.getByText('[Quote from a real user — coming soon]');
    await expect(testimonialCards.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Footer Section ──────────────────────────────────────────────────────────

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for the footer to be visible
    await page.locator('footer').waitFor({ state: 'visible', timeout: 10_000 });
  });

  test('renders the footer CTA heading "Ready to upgrade?"', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /Ready to/ });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('shows "Open source. Self-hostable. Free forever." text', async ({ page }) => {
    await expect(page.getByText('Open source. Self-hostable. Free forever.')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('renders the footer Volvox brand', async ({ page }) => {
    const footerLogo = page.locator('footer').getByText('Volvox', { exact: true });
    await expect(footerLogo).toBeVisible();
  });

  test('shows Product, Resources, and Company footer link sections', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('Product')).toBeVisible();
    await expect(footer.getByText('Resources')).toBeVisible();
    await expect(footer.getByText('Company')).toBeVisible();
  });

  test('shows the copyright notice', async ({ page }) => {
    const year = new Date().getFullYear();
    await expect(page.getByText(`© ${year} Volvox LLC`)).toBeVisible();
  });

  test('has social links (GitHub, Discord, X)', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByLabel('GitHub')).toBeVisible();
    await expect(footer.getByLabel('Discord')).toBeVisible();
    await expect(footer.getByLabel('X (Twitter)')).toBeVisible();
  });

  test('has a Status link', async ({ page }) => {
    const statusLink = page.locator('footer').getByText('Status', { exact: true });
    await expect(statusLink).toBeVisible();
  });

  test('renders email newsletter input', async ({ page }) => {
    const emailInput = page.locator('footer').getByPlaceholder('Enter your email...');
    await expect(emailInput).toBeVisible();
  });

  test('footer has links in Product section', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Pricing' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });
});

// ─── Full Page Smoke Test ────────────────────────────────────────────────────

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

    // Named section anchors
    await expect(page.locator('#features')).toBeAttached();
    await expect(page.locator('#pricing')).toBeAttached();
    await expect(page.locator('#dashboard')).toBeAttached();
    await expect(page.locator('#compare')).toBeAttached();

    // Footer
    await expect(page.locator('footer')).toBeAttached();
  });
});

// ─── Theme Toggle ────────────────────────────────────────────────────────────

test.describe('Theme Toggle', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('theme toggle button is present in header', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    const themeToggle = header.getByRole('button', { name: /theme/i });
    await expect(themeToggle).toBeVisible();
  });
});

// ─── Accessibility ───────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('page has a lang attribute', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('all images have alt text or are decorative', async ({ page }) => {
    await page.goto('/');
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaHidden = await img.getAttribute('aria-hidden');
      expect(alt !== null || ariaHidden === 'true').toBeTruthy();
    }
  });

  test('mobile menu toggle has correct aria attributes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Only applies to mobile viewport');
    await page.goto('/');
    const toggle = page.getByLabel('Toggle menu');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'mobile-nav');
  });

  test('pricing toggle has correct role and aria attributes', async ({ page }) => {
    await page.goto('/');
    await scrollSectionIntoView(page, '#pricing');
    const toggle = page.getByRole('switch', { name: 'Toggle annual billing' });
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

// ─── Sign In Navigation ──────────────────────────────────────────────────────

test.describe('Sign In Navigation', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('clicking Sign In navigates to /login', async ({ page }) => {
    await page.goto('/');
    const signIn = page.locator('header a[href="/login"]').first();
    await signIn.click();
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });
});
