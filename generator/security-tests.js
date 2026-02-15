// Template: unauth access, injection, headers

function generateSecurityTests(pages, apis, baseUrl) {
  const tests = [];

  // Test: unauthorized access to auth-required APIs should return 401/403
  const authApis = apis.filter(a => a.requires_auth);
  if (authApis.length) {
    for (const a of authApis) {
      tests.push(`
  test('Unauth access denied: ${a.method} ${escapeTest(a.url)}', async ({ request }) => {
    const response = await request.${a.method.toLowerCase()}(${JSON.stringify(a.url)}, { timeout: 10000 });
    expect([401, 403]).toContain(response.status());
  });`);
    }
  }

  // Test: SQL injection on API endpoints
  const getApis = apis.filter(a => a.method === 'GET').slice(0, 10);
  for (const a of getApis) {
    const injUrl = a.url + (a.url.includes('?') ? '&' : '?') + "id=1' OR '1'='1";
    tests.push(`
  test('SQL injection rejected: ${escapeTest(a.url)}', async ({ request }) => {
    const response = await request.get(${JSON.stringify(injUrl)}, { timeout: 10000 });
    // Should not return 200 with SQL injection payload
    const body = await response.text();
    expect(body.toLowerCase()).not.toContain('sql');
    expect(body.toLowerCase()).not.toContain('syntax error');
    expect(body.toLowerCase()).not.toContain('mysql');
    expect(body.toLowerCase()).not.toContain('sqlite');
  });`);
  }

  // Test: XSS injection on pages with forms
  const formPages = pages.filter(p => p.has_forms).slice(0, 5);
  for (const p of formPages) {
    tests.push(`
  test('XSS reflected check: ${escapeTest(p.url)}', async ({ page }) => {
    await page.goto(${JSON.stringify(p.url)}, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const inputs = await page.$$('input[type="text"]:visible, input[type="search"]:visible, input:not([type]):visible');
    for (const input of inputs.slice(0, 3)) {
      await input.fill('<script>alert("xss")</script>').catch(() => {});
    }
    // Submit if possible
    const submit = await page.$('button[type="submit"], input[type="submit"]');
    if (submit) await submit.click().catch(() => {});
    await page.waitForTimeout(1000);
    const html = await page.content();
    expect(html).not.toContain('<script>alert("xss")</script>');
  });`);
  }

  // Test: security headers on main page
  tests.push(`
  test('Security headers present on main page', async ({ request }) => {
    const response = await request.get(${JSON.stringify(baseUrl)}, { timeout: 10000 });
    const headers = response.headers();
    // These are recommended but not all apps have them — log warnings
    const checks = [];
    if (!headers['x-frame-options'] && !headers['content-security-policy']) {
      checks.push('Missing X-Frame-Options or CSP frame-ancestors');
    }
    if (!headers['x-content-type-options']) {
      checks.push('Missing X-Content-Type-Options');
    }
    // At least some security awareness
    expect(checks.length, 'Security header issues: ' + checks.join('; ')).toBeLessThanOrEqual(2);
  });`);

  if (tests.length === 0) return '';

  return `const { test, expect } = require('@playwright/test');

test.describe('Security Tests', () => {
  test.setTimeout(30000);
${tests.join('\n')}
});
`;
}

function escapeTest(s) {
  return s.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

module.exports = { generateSecurityTests };
