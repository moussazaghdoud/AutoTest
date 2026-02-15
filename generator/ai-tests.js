// Generates a Playwright spec from a user prompt via OpenAI
const OpenAI = require('openai');

async function generateAiTests(prompt, context) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set — add it to your environment variables');
  }

  console.log('[AI Tests] Calling OpenAI with prompt:', prompt.substring(0, 80));

  const openai = new OpenAI({ apiKey, timeout: 60000 });

  const { baseUrl, pages, apis, forms, authHeaders } = context;

  // Build a rich summary including UI elements from each page
  let pagesWithUi = 0;
  const pageSummary = pages.slice(0, 15).map(p => {
    let entry = `  - ${p.url} (status: ${p.status_code}, title: "${p.title || ''}")`;
    const ui = typeof p.ui_elements === 'string' ? JSON.parse(p.ui_elements || '{}') : (p.ui_elements || {});
    const hasUi = (ui.headings?.length || ui.buttons?.length || ui.inputs?.length || ui.links?.length);
    if (hasUi) pagesWithUi++;
    if (ui.headings && ui.headings.length) entry += `\n    Headings: ${ui.headings.join(' | ')}`;
    if (ui.buttons && ui.buttons.length) entry += `\n    Buttons: ${ui.buttons.join(' | ')}`;
    if (ui.inputs && ui.inputs.length) entry += `\n    Inputs: ${ui.inputs.map(i => `[${i.type}] placeholder="${i.placeholder || ''}" label="${i.label || ''}" name="${i.name || ''}"`).join(', ')}`;
    if (ui.links && ui.links.length) entry += `\n    Links: ${ui.links.slice(0, 15).join(' | ')}`;
    if (ui.selects && ui.selects.length) entry += `\n    Selects: ${ui.selects.map(s => `"${s.label}" (${s.options.join(', ')})`).join('; ')}`;
    return entry;
  }).join('\n');

  console.log(`[AI Tests] ${pages.length} pages total, ${pagesWithUi} have UI elements`);

  const apiSummary = apis.slice(0, 30).map(a => `  - ${a.method} ${a.url} (status: ${a.status_code || a.response_status})`).join('\n');
  const formSummary = forms.slice(0, 10).map(f => `  - ${f.page_url} — ${f.form_action || f.action || 'inline'} (${f.field_count || '?'} fields)`).join('\n');

  // Decide test strategy based on what was discovered
  const hasApis = apis.length > 0;
  const hasForms = forms.length > 0;
  const hasPages = pages.length > 0;

  let strategyHint = '';
  if (hasApis && hasForms) {
    strategyHint = `This target has both API endpoints and browser forms. Use API tests (request fixture) when the user asks to test backend logic, data creation, or validation. Use browser tests (page fixture) when the user asks to test UI behavior, navigation, or form interaction.`;
  } else if (hasApis) {
    strategyHint = `This target has API endpoints. Prefer API tests using the request fixture for speed and reliability.`;
  } else if (hasForms || hasPages) {
    strategyHint = `This target is primarily a website with pages and forms. Use browser tests with the page fixture.`;
  }

  const systemPrompt = `You are a senior Playwright test engineer. Generate a complete, runnable Playwright spec file (.spec.js) based on the user's testing request.

RULES:
- Output ONLY valid JavaScript code — no markdown, no explanation, no backticks.
- Use const { test, expect } = require('@playwright/test');
- Wrap all tests in test.describe('Custom AI Tests', () => { ... });
- Set test.setTimeout(120000) inside describe.
- Each test() must have a clear descriptive name.

STRATEGY:
${strategyHint}
Choose the right approach for what the user is asking. Mix API and browser tests when it makes sense.

API TESTS (for backend/data/validation testing):
- Use the \`request\` fixture: test('...', async ({ request }) => { ... })
- Use request.post(), request.get(), request.put(), request.delete()
- Always pass full absolute URLs: request.post('${baseUrl}/api/endpoint', { data: {...} })
- Check response.status() and response.json() for assertions.

BROWSER TESTS (for UI/navigation/visual testing):
- Use the \`page\` fixture: test('...', async ({ page }) => { ... })
- Use page.goto('${baseUrl}/path') with full absolute URL.

CRITICAL BROWSER TEST PATTERNS — follow these EXACTLY to avoid errors:

1. ALWAYS wait for the page to fully load after navigation:
   await page.goto('${baseUrl}/path');
   await page.waitForLoadState('networkidle');

2. STRICT MODE — ALWAYS use .first() on EVERY locator to avoid "strict mode violation" errors:
   await page.getByRole('button', { name: 'Text' }).first().waitFor({ state: 'visible', timeout: 30000 });
   await page.getByRole('button', { name: 'Text' }).first().click();

3. NEVER use generic locators like getByRole('textbox') or getByRole('button') without a name.
   ALWAYS use the most specific locator available:
   - BEST: page.getByPlaceholder('EXACT PLACEHOLDER').first()
   - GOOD: page.getByLabel('EXACT LABEL').first()
   - GOOD: page.locator('input[name="EXACT NAME"]').first()
   - OK: page.getByRole('button', { name: 'EXACT TEXT' }).first()
   - FORBIDDEN: page.getByRole('textbox') — this matches ALL text inputs and WILL fail

4. When filling inputs, ALWAYS use placeholder or name, never generic role:
   await page.getByPlaceholder('Email').first().waitFor({ state: 'visible', timeout: 30000 });
   await page.getByPlaceholder('Email').first().fill('test@example.com');
   // OR if no placeholder, use the name attribute:
   await page.locator('input[name="email"]').first().fill('test@example.com');

5. For navigation that loads a new page, wait again:
   await page.getByRole('link', { name: 'Sign Up' }).first().click();
   await page.waitForLoadState('networkidle');

6. Use EXACT texts from the page descriptions below for locators:
   - For inputs with placeholder: page.getByPlaceholder('EXACT PLACEHOLDER').first()
   - For inputs with label: page.getByLabel('EXACT LABEL').first()
   - For inputs with name only: page.locator('input[name="EXACT NAME"]').first()
   - For buttons: page.getByRole('button', { name: 'EXACT TEXT FROM LIST' }).first()
   - For links: page.getByRole('link', { name: 'EXACT TEXT FROM LIST' }).first()
   - For headings: page.getByRole('heading', { name: 'EXACT TEXT' }).first()

7. NEVER guess or invent button/link/input text — ONLY use what is listed in the page descriptions below.

8. For testing form submission:
   - Fill ALL required fields before submitting
   - Use realistic test data (test@example.com, John, Doe, etc.)
   - After submit, wait for navigation or response: await page.waitForLoadState('networkidle');

9. For multi-step flows (signup, checkout, etc.):
   - Navigate to the starting page first
   - Complete each step sequentially
   - Add assertions after each step to verify progress

10. ASSERTIONS — use SAFE assertions that don't guess unknown text:
   - NEVER guess error messages or success messages — you don't know the exact text.
   - After form submit, use ONE of these safe patterns:
     a) Check URL changed: expect(page.url()).not.toBe(previousUrl);
     b) Check page has some visible content: await expect(page.locator('body')).toContainText(/./);
     c) Check the form is no longer visible (success): await expect(page.locator('form').first()).not.toBeVisible({ timeout: 10000 });
     d) Check for any error/alert element appearing: const hasError = await page.locator('[class*="error"], [class*="alert"], [role="alert"]').first().isVisible().catch(() => false);
   - For wrong password test: submit the form, wait 3 seconds, then check that the page URL didn't change (still on login) OR that some error element appeared — do NOT assert specific error text like "Invalid credentials".
   - For account creation test: fill form, submit, wait, then check URL changed OR a success/dashboard/welcome page appeared.
   - Keep assertions simple and resilient. It is MUCH better to have a passing test with a loose assertion than a failing test with a wrong guess.

GENERAL:
- Base URL: ${baseUrl}
${Object.keys(authHeaders).length > 0 ? `- Auth headers to include: ${JSON.stringify(authHeaders)}` : '- No authentication required.'}
- Be practical — test what the user asked for, not more.
- Generate between 3 and 10 tests depending on the scope of the request.
- Test both success cases AND error cases when relevant.
- Use the discovered endpoints and pages listed below — do NOT invent URLs that are not in the list.`;

  const userMessage = `Here is what was discovered on the target application:

PAGES (with real UI elements found on each page):
${pageSummary || '  (none discovered)'}

API ENDPOINTS:
${apiSummary || '  (none discovered)'}

FORMS:
${formSummary || '  (none discovered)'}

USER REQUEST:
${prompt}

Generate the Playwright spec file now. Remember: wait for networkidle after every navigation, and waitFor({ state: 'visible' }) before every interaction.`;

  // Log the full context being sent (truncated for readability)
  console.log('[AI Tests] Page summary being sent to OpenAI:');
  console.log(pageSummary ? pageSummary.substring(0, 1500) : '  (empty - no pages with UI elements)');

  // Race the OpenAI call against a 55-second timeout
  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI request timed out after 55s')), 55000)
    ),
  ]);

  console.log('[AI Tests] OpenAI responded successfully');

  let code = response.choices[0].message.content.trim();

  // Strip markdown fences if the model wraps in ```
  code = code.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```$/i, '');

  // Validate it at least has the expected structure
  if (!code.includes('test(') || !code.includes('expect')) {
    throw new Error('OpenAI returned invalid test code — missing test() or expect()');
  }

  // Log the generated test for debugging
  console.log('[AI Tests] Generated spec preview:', code.substring(0, 500));

  return code;
}

module.exports = { generateAiTests };
