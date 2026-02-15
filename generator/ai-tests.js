// AI test generation — OpenAI returns a JSON test plan, we generate bulletproof Playwright code
const OpenAI = require('openai');

async function generateAiTests(prompt, context) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const openai = new OpenAI({ apiKey, timeout: 60000 });
  const { baseUrl, pages, apis, forms, authHeaders } = context;

  // Build page summary for OpenAI context
  const pageSummary = pages.slice(0, 15).map(p => {
    const ui = typeof p.ui_elements === 'string' ? JSON.parse(p.ui_elements || '{}') : (p.ui_elements || {});
    let entry = `PAGE: ${p.url} (title: "${p.title || ''}")`;
    if (ui.headings?.length) entry += `\n  Headings: ${ui.headings.join(' | ')}`;
    if (ui.buttons?.length) entry += `\n  Buttons: ${ui.buttons.join(' | ')}`;
    if (ui.inputs?.length) entry += `\n  Inputs: ${ui.inputs.map(i => `"${i.placeholder || i.label || i.name}" [${i.type}]`).join(', ')}`;
    if (ui.links?.length) entry += `\n  Links: ${ui.links.slice(0, 15).join(' | ')}`;
    if (ui.selects?.length) entry += `\n  Selects: ${ui.selects.map(s => `"${s.label}" (${s.options.join(', ')})`).join('; ')}`;
    if (ui.textSnippets?.length) entry += `\n  Text: ${ui.textSnippets.join(' | ')}`;
    return entry;
  }).join('\n\n');

  const apiSummary = apis.slice(0, 20).map(a => `${a.method} ${a.url} (${a.status_code || a.response_status})`).join('\n');

  console.log(`[AI] Sending ${pages.length} pages to OpenAI`);
  console.log(`[AI] Page context:\n${pageSummary.substring(0, 2000)}`);

  const systemPrompt = `You are a test planner. Given a web application and a user request, output a JSON array of test plans.

RULES:
- Output ONLY valid JSON — no markdown, no explanation, no backticks.
- Each test is an object with "name" (string) and "steps" (array).
- Each step is an object with an "action" and parameters.

AVAILABLE ACTIONS:
  {"action": "goto", "path": "/login"}
  {"action": "click_link", "text": "Sign Up"}
  {"action": "click_button", "text": "Submit"}
  {"action": "fill", "field": "Email", "value": "test@example.com"}
  {"action": "select", "field": "Country", "value": "France"}
  {"action": "wait", "seconds": 2}
  {"action": "assert_url_contains", "text": "/dashboard"}
  {"action": "assert_url_changed"}
  {"action": "assert_url_not_changed"}
  {"action": "assert_visible", "text": "Welcome"}
  {"action": "assert_not_visible", "text": "Sign Up"}
  {"action": "assert_element_exists", "selector": ".error"}
  {"action": "assert_element_count", "selector": ".alert", "min": 1}
  {"action": "assert_page_has_text", "pattern": "confirm|success|welcome|created|thank|check your email"}
  {"action": "api_get", "path": "/api/users", "assert_status": 200}
  {"action": "api_post", "path": "/api/login", "body": {"email": "x", "password": "y"}, "assert_status": 401}

FIELD MATCHING:
- The "field" value in "fill" and "select" will be matched against placeholder, label, aria-label, and name attributes — use EXACT text from the page descriptions below.

IMPORTANT:
- ONLY use button text, link text, and field names that appear in the page descriptions below.
- Do NOT invent or guess element text that is not listed.
- Keep tests simple: 3-6 steps each.
- Generate 2-5 tests depending on scope.
- For login with wrong password: fill form, submit, wait 2 seconds, then assert_url_not_changed.
- For account creation: fill all visible fields, click submit, wait 3 seconds, then ONLY use assert_url_changed. This is the most reliable check — the site will redirect to a login page, confirmation page, or dashboard after successful signup.
- Do NOT use assert_url_contains with specific paths like "/dashboard" or "/welcome" — you don't know where the site redirects.
- For Salesforce lead verification: use an api_get or api_post to check if the lead exists in Salesforce after account creation.
- Use realistic test data: test@example.com, John, Doe, Password123!, etc.

Base URL: ${baseUrl}`;

  const userMessage = `DISCOVERED PAGES:
${pageSummary || '(none)'}

API ENDPOINTS:
${apiSummary || '(none)'}

USER REQUEST: ${prompt}

Output the JSON test plan array now.`;

  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI timed out after 55s')), 55000)),
  ]);

  let raw = response.choices[0].message.content.trim();
  raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');

  console.log(`[AI] Raw plan:\n${raw.substring(0, 1500)}`);

  const tests = JSON.parse(raw);
  if (!Array.isArray(tests) || tests.length === 0) throw new Error('OpenAI returned empty test plan');

  // Convert JSON plan to bulletproof Playwright spec
  return planToPlaywright(tests, baseUrl, authHeaders);
}

function planToPlaywright(tests, baseUrl, authHeaders) {
  const lines = [];
  lines.push(`const { test, expect } = require('@playwright/test');`);
  lines.push(``);
  lines.push(`test.describe('Custom AI Tests', () => {`);
  lines.push(`  test.setTimeout(120000);`);
  lines.push(``);

  for (const t of tests) {
    const isApiOnly = t.steps.every(s => s.action.startsWith('api_'));
    const fixture = isApiOnly ? 'request' : 'page';

    lines.push(`  test('${esc(t.name)}', async ({ ${fixture} }) => {`);

    if (!isApiOnly) {
      lines.push(`    let previousUrl = '';`);
    }

    for (const step of t.steps) {
      lines.push(`    // ${step.action}: ${JSON.stringify(step).substring(0, 80)}`);
      lines.push(`    try {`);

      switch (step.action) {
        case 'goto': {
          const gotoUrl = `${baseUrl.replace(/\/$/, '')}${step.path || ''}`;
          lines.push(`      await page.goto('${gotoUrl}', { waitUntil: 'networkidle', timeout: 30000 });`);
          lines.push(`      await page.waitForTimeout(1500);`);
          lines.push(`      previousUrl = page.url();`);
          break;
        }

        case 'click_link':
          lines.push(`      await page.getByRole('link', { name: '${esc(step.text)}' }).first().waitFor({ state: 'visible', timeout: 15000 });`);
          lines.push(`      await page.getByRole('link', { name: '${esc(step.text)}' }).first().click();`);
          lines.push(`      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});`);
          lines.push(`      await page.waitForTimeout(1000);`);
          break;

        case 'click_button':
          lines.push(`      await page.getByRole('button', { name: '${esc(step.text)}' }).first().waitFor({ state: 'visible', timeout: 15000 });`);
          lines.push(`      previousUrl = page.url();`);
          lines.push(`      await page.getByRole('button', { name: '${esc(step.text)}' }).first().click();`);
          lines.push(`      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});`);
          lines.push(`      await page.waitForTimeout(1500);`);
          break;

        case 'fill': {
          const f = esc(step.field);
          const v = esc(step.value);
          // Guess input type from field name for type-based fallback
          const fieldLower = (step.field || '').toLowerCase();
          let typeGuess = 'text';
          if (fieldLower.includes('email')) typeGuess = 'email';
          else if (fieldLower.includes('password')) typeGuess = 'password';
          else if (fieldLower.includes('phone') || fieldLower.includes('tel')) typeGuess = 'tel';
          else if (fieldLower.includes('search')) typeGuess = 'search';
          else if (fieldLower.includes('url') || fieldLower.includes('website')) typeGuess = 'url';

          lines.push(`      {`);
          lines.push(`        let filled = false;`);
          lines.push(`        // Strategy 1: placeholder`);
          lines.push(`        const byPlaceholder = page.getByPlaceholder('${f}').first();`);
          lines.push(`        if (await byPlaceholder.isVisible().catch(() => false)) { await byPlaceholder.fill('${v}'); filled = true; }`);
          lines.push(`        // Strategy 2: label`);
          lines.push(`        if (!filled) { const byLabel = page.getByLabel('${f}').first(); if (await byLabel.isVisible().catch(() => false)) { await byLabel.fill('${v}'); filled = true; } }`);
          lines.push(`        // Strategy 3: name attribute`);
          lines.push(`        if (!filled) { const byName = page.locator('input[name="${f}" i], textarea[name="${f}" i]').first(); if (await byName.isVisible().catch(() => false)) { await byName.fill('${v}'); filled = true; } }`);
          lines.push(`        // Strategy 4: partial placeholder`);
          lines.push(`        if (!filled) { const partial = page.locator('input[placeholder*="${f}" i], textarea[placeholder*="${f}" i]').first(); if (await partial.isVisible().catch(() => false)) { await partial.fill('${v}'); filled = true; } }`);
          lines.push(`        // Strategy 5: input type (${typeGuess})`);
          lines.push(`        if (!filled) { const byType = page.locator('input[type="${typeGuess}"]').first(); if (await byType.isVisible().catch(() => false)) { await byType.fill('${v}'); filled = true; } }`);
          lines.push(`        // Strategy 6: any visible text/email/password input`);
          lines.push(`        if (!filled) { const any = page.locator('input:visible').first(); await any.waitFor({ state: 'visible', timeout: 10000 }); await any.fill('${v}'); filled = true; }`);
          lines.push(`        if (!filled) throw new Error('Could not find field: ${f}');`);
          lines.push(`      }`);
          break;
        }

        case 'select': {
          const f = esc(step.field);
          const v = esc(step.value);
          lines.push(`      {`);
          lines.push(`        const sel = page.getByLabel('${f}').first();`);
          lines.push(`        if (await sel.isVisible().catch(() => false)) {`);
          lines.push(`          await sel.selectOption({ label: '${v}' });`);
          lines.push(`        } else {`);
          lines.push(`          await page.locator('select[name="${f}" i]').first().selectOption({ label: '${v}' });`);
          lines.push(`        }`);
          lines.push(`      }`);
          break;
        }

        case 'wait':
          lines.push(`      await page.waitForTimeout(${(step.seconds || 2) * 1000});`);
          break;

        case 'assert_url_contains':
          lines.push(`      const currentUrl = page.url();`);
          lines.push(`      const target = '${esc(step.text)}'.toLowerCase();`);
          lines.push(`      expect(currentUrl.toLowerCase()).toContain(target);`);
          break;

        case 'assert_url_not_changed':
          lines.push(`      expect(page.url()).toBe(previousUrl);`);
          break;

        case 'assert_url_changed':
          lines.push(`      expect(page.url()).not.toBe(previousUrl);`);
          break;

        case 'assert_visible':
          lines.push(`      await expect(page.getByText('${esc(step.text)}').first()).toBeVisible({ timeout: 10000 });`);
          break;

        case 'assert_not_visible':
          lines.push(`      await expect(page.getByText('${esc(step.text)}').first()).not.toBeVisible({ timeout: 5000 });`);
          break;

        case 'assert_page_has_text': {
          const pattern = esc(step.pattern || 'confirm|success|welcome|created|thank');
          lines.push(`      {`);
          lines.push(`        const body = await page.locator('body').innerText();`);
          lines.push(`        const pattern = new RegExp('${pattern}', 'i');`);
          lines.push(`        expect(body).toMatch(pattern);`);
          lines.push(`      }`);
          break;
        }

        case 'assert_element_exists':
          lines.push(`      await expect(page.locator('${esc(step.selector)}').first()).toBeVisible({ timeout: 10000 });`);
          break;

        case 'assert_element_count':
          lines.push(`      const count = await page.locator('${esc(step.selector)}').count();`);
          lines.push(`      expect(count).toBeGreaterThanOrEqual(${step.min || 1});`);
          break;

        case 'api_get': {
          const headers = Object.keys(authHeaders).length > 0 ? `, { headers: ${JSON.stringify(authHeaders)} }` : '';
          lines.push(`      const resp = await request.get('${baseUrl}${step.path}'${headers});`);
          if (step.assert_status) lines.push(`      expect(resp.status()).toBe(${step.assert_status});`);
          break;
        }

        case 'api_post': {
          const headers = Object.keys(authHeaders).length > 0 ? `, headers: ${JSON.stringify(authHeaders)}` : '';
          lines.push(`      const resp = await request.post('${baseUrl}${step.path}', { data: ${JSON.stringify(step.body || {})}${headers} });`);
          if (step.assert_status) lines.push(`      expect(resp.status()).toBe(${step.assert_status});`);
          break;
        }

        default:
          lines.push(`      // Unknown action: ${step.action}`);
      }

      lines.push(`    } catch (e) {`);
      lines.push(`      console.log('[Step failed] ${step.action}: ' + e.message.substring(0, 200));`);
      // For assertions, re-throw; for interactions, continue
      if (step.action.startsWith('assert_')) {
        lines.push(`      throw e;`);
      }
      lines.push(`    }`);
      lines.push(``);
    }

    lines.push(`  });`);
    lines.push(``);
  }

  lines.push(`});`);
  return lines.join('\n');
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

module.exports = { generateAiTests };
