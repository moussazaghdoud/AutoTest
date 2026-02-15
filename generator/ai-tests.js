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
  const pageSummary = pages.slice(0, 15).map(p => {
    let entry = `  - ${p.url} (status: ${p.status_code}, title: "${p.title || ''}")`;
    const ui = typeof p.ui_elements === 'string' ? JSON.parse(p.ui_elements || '{}') : (p.ui_elements || {});
    if (ui.headings && ui.headings.length) entry += `\n    Headings: ${ui.headings.join(' | ')}`;
    if (ui.buttons && ui.buttons.length) entry += `\n    Buttons: ${ui.buttons.join(' | ')}`;
    if (ui.inputs && ui.inputs.length) entry += `\n    Inputs: ${ui.inputs.map(i => `[${i.type}] "${i.placeholder || i.label || i.name}"`).join(', ')}`;
    if (ui.links && ui.links.length) entry += `\n    Links: ${ui.links.slice(0, 10).join(' | ')}`;
    if (ui.selects && ui.selects.length) entry += `\n    Selects: ${ui.selects.map(s => `"${s.label}" (${s.options.join(', ')})`).join('; ')}`;
    return entry;
  }).join('\n');
  const apiSummary = apis.slice(0, 30).map(a => `  - ${a.method} ${a.url} (status: ${a.status_code})`).join('\n');
  const formSummary = forms.slice(0, 10).map(f => `  - ${f.page_url} — ${f.form_action || 'inline'} (${f.field_count || '?'} fields)`).join('\n');

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

  const systemPrompt = `You are a Playwright test engineer. Generate a complete, runnable Playwright spec file (.spec.js) based on the user's testing request.

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
- IMPORTANT: Each page below lists the REAL buttons, inputs, links, and headings found on it. USE THESE EXACT TEXTS for your locators:
  - For buttons: page.getByRole('button', { name: 'EXACT TEXT FROM LIST' })
  - For inputs: page.getByPlaceholder('EXACT PLACEHOLDER FROM LIST') or page.getByLabel('EXACT LABEL')
  - For links: page.getByRole('link', { name: 'EXACT TEXT FROM LIST' })
  - For headings: page.getByRole('heading', { name: 'EXACT TEXT' })
- If multiple elements match, use .first() or .nth(0) to pick the first one.
- Always add { timeout: 15000 } to waitFor/click/fill calls.
- NEVER guess or invent button/link text — ONLY use what is listed in the page descriptions below.

GENERAL:
- Base URL: ${baseUrl}
${Object.keys(authHeaders).length > 0 ? `- Auth headers to include: ${JSON.stringify(authHeaders)}` : '- No authentication required.'}
- Be practical — test what the user asked for, not more.
- Generate between 3 and 15 tests depending on the scope of the request.
- Test both success cases AND error cases when relevant.
- Use the discovered endpoints and pages listed below — do NOT invent URLs that are not in the list.`;

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
