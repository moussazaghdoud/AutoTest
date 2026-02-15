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
- Set test.setTimeout(60000) inside describe.
- Each test() must have a clear descriptive name.
- Use page.goto(), page.click(), page.fill(), expect(), request.get(), etc.
- For API tests use the \`request\` fixture: test('...', async ({ request }) => { ... })
- For browser tests use the \`page\` fixture: test('...', async ({ page }) => { ... })
- Base URL: ${baseUrl}
${Object.keys(authHeaders).length > 0 ? `- Auth headers to include: ${JSON.stringify(authHeaders)}` : '- No authentication required.'}
- Be practical — test what the user asked for, not more.
- Generate between 3 and 15 tests depending on the scope of the request.`;

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
