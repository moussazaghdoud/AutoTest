// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');

test.describe('Public Pages E2E', () => {
  const pages = [
    { path: '/', name: 'Landing Page' },
    { path: '/blog', name: 'Blog' },
    { path: '/reviews', name: 'Reviews' },
    { path: '/support', name: 'Support' },
    { path: '/tutorials', name: 'Tutorials' },
    { path: '/login', name: 'Client Login' },
  ];

  for (const pg of pages) {
    test(`${pg.name} loads successfully`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const response = await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
      expect(response.status()).toBeLessThan(400);

      // Page should have a title
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);

      // No JS console errors
      const critical = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('net::'));
      expect(critical).toHaveLength(0);
    });
  }

  test('Landing page has key elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Should have a navigation bar
    const nav = page.locator('nav, header, [class*="nav"]').first();
    await expect(nav).toBeVisible();

    // Should have at least one CTA button or link
    const links = await page.locator('a').count();
    expect(links).toBeGreaterThan(0);
  });
});
