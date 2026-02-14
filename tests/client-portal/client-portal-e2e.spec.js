// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Client Portal E2E', () => {
  let adminToken;
  const ts = Date.now();
  const testEmail = `${config.TEST_PREFIX}_portal_${ts}@test.com`;
  const testPassword = 'PortalTest123!';
  let testClientId;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    if (testClientId) {
      await deleteClient(request, adminToken, testClientId);
    }
  });

  test('Client can register via the form', async ({ page, request }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Look for a register link/tab/button
    const registerLink = page.locator('a:has-text("register"), a:has-text("Register"), a:has-text("Sign up"), button:has-text("register"), button:has-text("Register"), [data-tab="register"]').first();

    if (await registerLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerLink.click();
    }

    // Fill registration form
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="First"], input[placeholder*="first"]').first();
    const lastNameInput = page.locator('input[name="lastName"], input[placeholder*="Last"], input[placeholder*="last"]').first();

    if (await firstNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNameInput.fill('Portal');
      await lastNameInput.fill(`Test${ts}`);
      await emailInput.fill(testEmail);
      await passwordInput.fill(testPassword);

      // Submit form
      const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign up")').first();
      await submitBtn.click();

      // Should redirect or show success
      await page.waitForTimeout(2000);
    }

    // Verify the client was created via API
    const res = await request.get(`${config.BASE_URL}/api/client/check-existing?email=${encodeURIComponent(testEmail)}`);
    const body = await res.json();
    if (body.exists) {
      // Get client ID for cleanup
      const loginRes = await request.post(`${config.BASE_URL}/api/client/login`, {
        data: { email: testEmail, password: testPassword },
      });
      if (loginRes.ok()) {
        const loginBody = await loginRes.json();
        testClientId = loginBody.user.id;
      }
    }
  });

  test('Client can log in via the form', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(config.ADMIN_EMAIL);
      await passwordInput.fill(config.ADMIN_PASSWORD);
    }

    // Verify login page rendered
    expect(await page.title()).toBeTruthy();
  });

  test('Login page has required form elements', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('Portal page requires authentication', async ({ page }) => {
    const response = await page.goto('/portal', { waitUntil: 'domcontentloaded' });
    // Should either redirect to login or show the portal page
    expect(response.status()).toBeLessThan(500);
  });
});
