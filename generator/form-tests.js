// Template: validation, missing fields

function generateFormTests(forms, baseUrl) {
  if (!forms.length) return '';

  const tests = forms.map((f, idx) => {
    let fields;
    try { fields = JSON.parse(f.fields); } catch { fields = []; }
    if (fields.length === 0) return '';

    const requiredFields = fields.filter(fi => fi.required);
    const testName = `Form #${idx + 1} on ${f.page_url}`;

    const subtests = [];

    // Test: submit with empty required fields
    if (requiredFields.length > 0) {
      subtests.push(`
  test('${escapeTest(testName)} — empty required fields rejected', async ({ page }) => {
    await page.goto(${JSON.stringify(f.page_url)}, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Try submitting without filling required fields
    const submit = await page.$('button[type="submit"], input[type="submit"]');
    if (submit) {
      await submit.click();
      await page.waitForTimeout(500);
    }
    // Check that we're still on the same page or have validation errors
    const url = page.url();
    const hasValidation = await page.$$eval('[class*="error"], [class*="invalid"], .field-error, .validation-error, :invalid',
      els => els.length > 0
    );
    // Either stayed on the same page or has validation messages
    expect(url.includes(${JSON.stringify(new URL(f.page_url).pathname)}) || hasValidation).toBeTruthy();
  });`);
    }

    // Test: fill with invalid email format
    const emailField = fields.find(fi => fi.type === 'email' || /email/i.test(fi.name));
    if (emailField) {
      const selector = emailField.id ? `#${emailField.id}` : `input[name="${emailField.name}"]`;
      subtests.push(`
  test('${escapeTest(testName)} — invalid email rejected', async ({ page }) => {
    await page.goto(${JSON.stringify(f.page_url)}, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const input = await page.$(${JSON.stringify(selector)});
    if (input) {
      await input.fill('not-an-email');
      const submit = await page.$('button[type="submit"], input[type="submit"]');
      if (submit) await submit.click();
      await page.waitForTimeout(500);
      const isInvalid = await input.evaluate(el => !el.checkValidity());
      expect(isInvalid).toBeTruthy();
    }
  });`);
    }

    return subtests.join('\n');
  }).filter(t => t).join('\n');

  if (!tests.trim()) return '';

  return `const { test, expect } = require('@playwright/test');

test.describe('Form Tests', () => {
  test.setTimeout(30000);
${tests}
});
`;
}

function escapeTest(s) {
  return s.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

module.exports = { generateFormTests };
