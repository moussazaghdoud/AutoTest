// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');

test.describe('Admin Panel E2E', () => {
  test('Admin login page loads', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const response = await page.goto('/admin');
    expect(response.status()).toBeLessThan(500);
    expect(await page.title()).toBeTruthy();
  });

  test('Admin page has login form or dashboard', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    // Should have either a login form or dashboard content
    const hasLoginForm = await page.locator('input[type="email"], input[type="password"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasDashboard = await page.locator('[class*="dashboard"], [class*="sidebar"], [class*="admin"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLoginForm || hasDashboard).toBe(true);
  });

  test('Admin page does not have server errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const critical = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('net::') && !e.includes('401')
    );
    expect(critical).toHaveLength(0);
  });
});
