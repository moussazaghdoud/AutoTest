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

  // Build a concise summary of what was discovered
  const pageSummary = pages.slice(0, 20).map(p => `  - ${p.url} (status: ${p.status_code})`).join('\n');
  const apiSummary = apis.slice(0, 30).map(a => `  - ${a.method} ${a.url} (status: ${a.status_code})`).join('\n');
  const formSummary = forms.slice(0, 10).map(f => `  - ${f.page_url} — ${f.form_action || 'inline'} (${f.field_count || '?'} fields)`).join('\n');

  const systemPrompt = `You are a Playwright test engineer. Generate a complete, runnable Playwright spec file (.spec.js) based on the user's testing request.

RULES:
- Output ONLY valid JavaScript code — no markdown, no explanation, no backticks.
- Use const { test, expect } = require('@playwright/test');
- Wrap all tests in test.describe('Custom AI Tests', () => { ... });
- Set test.setTimeout(120000) inside describe.
- Each test() must have a clear descriptive name.

API TESTS (PREFERRED — use these whenever possible):
- Use the \`request\` fixture: test('...', async ({ request }) => { ... })
- Use request.post(), request.get(), request.put(), request.delete()
- Always pass full absolute URLs: request.post('${baseUrl}/api/endpoint', { data: {...} })
- Check response.status() and response.json() for assertions.
- API tests are fast and reliable — ALWAYS prefer them over browser tests.

BROWSER TESTS (only when testing visual/UI behavior):
- Use the \`page\` fixture: test('...', async ({ page }) => { ... })
- Use page.goto('${baseUrl}/path') with full absolute URL.
- NEVER guess CSS selectors — only use generic ones like 'form', 'input[type="email"]', 'button[type="submit"]', or text-based locators like page.getByRole(), page.getByText(), page.getByPlaceholder().
- Always add { timeout: 15000 } to waitFor/click/fill calls.

GENERAL:
- Base URL: ${baseUrl}
${Object.keys(authHeaders).length > 0 ? `- Auth headers to include: ${JSON.stringify(authHeaders)}` : '- No authentication required.'}
- Be practical — test what the user asked for, not more.
- Generate between 3 and 15 tests depending on the scope of the request.
- For account creation / registration: use the API endpoint (POST) directly, not the browser form.
- Test both success cases AND error cases (missing fields, duplicates, invalid data).`;

  const userMessage = `Here is what was discovered on the target application:

PAGES:
${pageSummary || '  (none discovered)'}

API ENDPOINTS:
${apiSummary || '  (none discovered)'}

FORMS:
${formSummary || '  (none discovered)'}

USER REQUEST:
${prompt}

Generate the Playwright spec file now.`;

  // Race the OpenAI call against a 45-second timeout
  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI request timed out after 45s')), 45000)
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

  return code;
}

module.exports = { generateAiTests };
