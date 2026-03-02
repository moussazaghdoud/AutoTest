// AI Test Intent Engine
// Accepts a high-level intent string and converts it into:
//   - Test objectives
//   - User stories / journeys
//   - Risk-based coverage map
//   - Test matrix (roles, browsers, devices, locales)
//   - Acceptance criteria
//   - Structured test specs (JSON) that drive automation

const OpenAI = require('openai');
const { getDb, run, get, all } = require('../db/db');

class IntentEngine {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || 'gpt-4o-mini';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY required for IntentEngine');
    this.openai = new OpenAI({ apiKey: this.apiKey, timeout: 90000 });
  }

  // Main entry: intent string + discovered context → structured test plan
  async generatePlan(intent, targetId, scanId) {
    const db = await getDb();
    const target = get(db, 'SELECT * FROM targets WHERE id = ?', [targetId]);
    if (!target) throw new Error(`Target ${targetId} not found`);

    // Load discovery data
    const pages = scanId ? all(db, 'SELECT * FROM discovered_pages WHERE scan_id = ?', [scanId]) : [];
    const apis = scanId ? all(db, 'SELECT * FROM discovered_apis WHERE scan_id = ?', [scanId]) : [];
    const forms = scanId ? all(db, 'SELECT * FROM discovered_forms WHERE scan_id = ?', [scanId]) : [];

    // Phase 1: Generate the structured plan via AI
    console.log(`[IntentEngine] Generating plan for intent: "${intent.substring(0, 80)}..."`);
    const planData = await this._aiGeneratePlan(intent, target, pages, apis, forms);

    // Phase 2: Store in database
    const planResult = run(db,
      `INSERT INTO test_plans (target_id, intent, objectives, user_stories, risk_map, test_matrix, acceptance_criteria, coverage_map, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        targetId,
        intent,
        JSON.stringify(planData.objectives),
        JSON.stringify(planData.user_stories),
        JSON.stringify(planData.risk_map),
        JSON.stringify(planData.test_matrix),
        JSON.stringify(planData.acceptance_criteria),
        JSON.stringify(planData.coverage_map),
      ]
    );
    const planId = planResult.lastInsertRowid;

    // Phase 3: Store individual test cases
    for (const tc of planData.test_cases) {
      run(db,
        `INSERT INTO test_plan_cases (plan_id, objective_id, name, description, category, priority, test_type, steps_json, preconditions, expected_result, tags, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          planId,
          tc.objective_id || null,
          tc.name,
          tc.description || '',
          tc.category || 'functional',
          tc.priority || 'medium',
          tc.test_type || 'happy_path',
          JSON.stringify(tc.steps || []),
          tc.preconditions || null,
          tc.expected_result || null,
          JSON.stringify(tc.tags || []),
          tc.role || 'user',
        ]
      );
    }

    // Phase 4: Initialize coverage entries
    for (const obj of planData.objectives) {
      const casesForObj = planData.test_cases.filter(tc => tc.objective_id === obj.id);
      for (const tc of casesForObj) {
        run(db,
          `INSERT INTO coverage_entries (plan_id, objective, test_case, status) VALUES (?, ?, ?, 'pending')`,
          [planId, obj.title, tc.name]
        );
      }
    }

    console.log(`[IntentEngine] Plan #${planId} created: ${planData.objectives.length} objectives, ${planData.test_cases.length} test cases`);

    return {
      planId,
      ...planData,
    };
  }

  // AI call to generate structured plan
  async _aiGeneratePlan(intent, target, pages, apis, forms) {
    const baseUrl = target.base_url;

    // Build context summary
    const pageSummary = pages.slice(0, 20).map(p => {
      const ui = typeof p.ui_elements === 'string' ? JSON.parse(p.ui_elements || '{}') : (p.ui_elements || {});
      let entry = `${p.url} — "${p.title || ''}"`;
      if (ui.headings?.length) entry += ` | Headings: ${ui.headings.slice(0, 5).join(', ')}`;
      if (ui.buttons?.length) entry += ` | Buttons: ${ui.buttons.slice(0, 8).join(', ')}`;
      if (ui.inputs?.length) entry += ` | Inputs: ${ui.inputs.slice(0, 5).map(i => i.label || i.name).join(', ')}`;
      return entry;
    }).join('\n');

    const apiSummary = apis.slice(0, 25).map(a =>
      `${a.method} ${a.url} → ${a.response_status || '?'} (auth: ${a.requires_auth ? 'yes' : 'no'})`
    ).join('\n');

    const formSummary = forms.slice(0, 10).map(f => {
      const fields = typeof f.fields === 'string' ? JSON.parse(f.fields || '[]') : (f.fields || []);
      return `${f.page_url} — ${f.method} ${f.action || 'inline'} | Fields: ${fields.map(fl => fl.name || fl.label || fl.type).join(', ')}`;
    }).join('\n');

    const systemPrompt = `You are a QA test architect. Given a web application and a user's test intent, produce a comprehensive structured test plan as a JSON object.

OUTPUT FORMAT (JSON only, no markdown):
{
  "objectives": [
    { "id": "OBJ-1", "title": "...", "description": "...", "risk_level": "high|medium|low", "feature_area": "..." }
  ],
  "user_stories": [
    { "id": "US-1", "as_a": "...", "i_want": "...", "so_that": "...", "objective_id": "OBJ-1" }
  ],
  "risk_map": {
    "high": ["...areas..."],
    "medium": ["...areas..."],
    "low": ["...areas..."]
  },
  "test_matrix": {
    "roles": ["admin", "user", "anonymous"],
    "browsers": ["chromium"],
    "viewports": ["desktop"],
    "locales": ["en"]
  },
  "acceptance_criteria": [
    { "id": "AC-1", "objective_id": "OBJ-1", "criterion": "...", "verification": "..." }
  ],
  "coverage_map": {
    "OBJ-1": { "happy_paths": 2, "negative_paths": 1, "edge_cases": 1, "security": 1 }
  },
  "test_cases": [
    {
      "name": "...",
      "description": "...",
      "objective_id": "OBJ-1",
      "category": "functional|security|accessibility|performance|visual",
      "priority": "critical|high|medium|low",
      "test_type": "happy_path|negative|edge_case|security|a11y|visual|performance",
      "role": "user|admin|anonymous",
      "preconditions": "...",
      "expected_result": "...",
      "tags": ["login", "auth"],
      "steps": [
        {"action": "goto", "path": "/login"},
        {"action": "fill", "field": "Email", "value": "test@example.com"},
        {"action": "click_button", "text": "Sign In"},
        {"action": "assert_url_changed"},
        {"action": "assert_visible", "text": "Dashboard"}
      ]
    }
  ]
}

AVAILABLE STEP ACTIONS (same as existing system):
  goto, click_link, click_button, fill, select, wait,
  assert_url_contains, assert_url_changed, assert_url_not_changed,
  assert_visible, assert_not_visible, assert_element_exists, assert_element_count,
  assert_page_has_text, api_get, api_post,
  screenshot, check_a11y, measure_load_time

RULES:
1. Generate 5-20 test cases depending on scope.
2. Cover: happy paths (40%), negative paths (25%), edge cases (15%), security (10%), accessibility (5%), performance (5%).
3. ONLY use button text, link text, field names from the page descriptions below. Do NOT invent UI elements.
4. For login tests with WRONG credentials: fill fake data, submit, assert_url_not_changed.
5. For login with VALID credentials: fill real credentials if available, submit, assert_url_changed. Do NOT use assert_element_exists(".error") for success scenarios.
6. Edge cases: empty fields, long values (500+ chars), special chars (<>'"&), numeric overflow.
7. Security: unauthorized access, session handling, injection attempts.
8. Accessibility: check_a11y action on key pages.
9. Performance: measure_load_time on critical pages.
10. Each test must have a clear expected_result.
11. Assign realistic priorities: authentication = critical, core workflows = high, edge cases = medium, cosmetic = low.

Base URL: ${baseUrl}`;

    const userMessage = `INTENT: ${intent}

DISCOVERED PAGES:
${pageSummary || '(no pages discovered — generate tests based on common patterns for the intent)'}

API ENDPOINTS:
${apiSummary || '(none discovered)'}

FORMS:
${formSummary || '(none discovered)'}

Generate the comprehensive test plan JSON now.`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    });

    let raw = response.choices[0].message.content.trim();
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');

    console.log(`[IntentEngine] AI response: ${raw.substring(0, 500)}...`);

    const parsed = JSON.parse(raw);

    // Validate and normalize the plan
    return this._normalizePlan(parsed);
  }

  // Validate and normalize the AI-generated plan
  _normalizePlan(raw) {
    const plan = {
      objectives: Array.isArray(raw.objectives) ? raw.objectives : [],
      user_stories: Array.isArray(raw.user_stories) ? raw.user_stories : [],
      risk_map: raw.risk_map || { high: [], medium: [], low: [] },
      test_matrix: {
        roles: raw.test_matrix?.roles || ['user'],
        browsers: raw.test_matrix?.browsers || ['chromium'],
        viewports: raw.test_matrix?.viewports || ['desktop'],
        locales: raw.test_matrix?.locales || ['en'],
      },
      acceptance_criteria: Array.isArray(raw.acceptance_criteria) ? raw.acceptance_criteria : [],
      coverage_map: raw.coverage_map || {},
      test_cases: [],
    };

    // Normalize test cases
    const rawCases = Array.isArray(raw.test_cases) ? raw.test_cases
      : Array.isArray(raw.tests) ? raw.tests
      : [];

    for (const tc of rawCases) {
      plan.test_cases.push({
        name: tc.name || 'Unnamed test',
        description: tc.description || '',
        objective_id: tc.objective_id || plan.objectives[0]?.id || 'OBJ-1',
        category: tc.category || 'functional',
        priority: tc.priority || 'medium',
        test_type: tc.test_type || 'happy_path',
        role: tc.role || 'user',
        preconditions: tc.preconditions || null,
        expected_result: tc.expected_result || null,
        tags: Array.isArray(tc.tags) ? tc.tags : [],
        steps: Array.isArray(tc.steps) ? tc.steps : [],
      });
    }

    // Ensure we have at least one objective
    if (plan.objectives.length === 0) {
      plan.objectives.push({
        id: 'OBJ-1',
        title: 'Primary test objective',
        description: 'Validate the specified user intent',
        risk_level: 'high',
        feature_area: 'general',
      });
    }

    return plan;
  }

  // Convert a stored plan into executable Playwright test code
  async planToPlaywright(planId, target) {
    const db = await getDb();
    const plan = get(db, 'SELECT * FROM test_plans WHERE id = ?', [planId]);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const cases = all(db, 'SELECT * FROM test_plan_cases WHERE plan_id = ? ORDER BY priority DESC, id ASC', [planId]);
    if (cases.length === 0) throw new Error(`Plan ${planId} has no test cases`);

    const baseUrl = target.base_url;
    const authConfig = typeof target.auth_config === 'string'
      ? JSON.parse(target.auth_config || '{}')
      : (target.auth_config || {});
    const authHeaders = {};
    if (target.auth_type === 'basic' && authConfig.username) {
      authHeaders['Authorization'] = `Basic ${Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64')}`;
    }
    if (target.auth_type === 'bearer' && authConfig.token) {
      authHeaders['Authorization'] = `Bearer ${authConfig.token}`;
    }

    // Group test cases by category for organized spec files
    const byCategory = {};
    for (const tc of cases) {
      const cat = tc.category || 'functional';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tc);
    }

    const specFiles = {};

    for (const [category, tests] of Object.entries(byCategory)) {
      const lines = [];
      lines.push(`const { test, expect } = require('@playwright/test');`);
      lines.push(``);
      lines.push(`// Auto-generated from Test Plan #${planId}`);
      lines.push(`// Category: ${category}`);
      lines.push(`// Generated: ${new Date().toISOString()}`);
      lines.push(``);
      lines.push(`test.describe('${esc(category)} Tests', () => {`);
      lines.push(`  test.setTimeout(120000);`);
      lines.push(``);

      for (const tc of tests) {
        const steps = typeof tc.steps_json === 'string' ? JSON.parse(tc.steps_json) : (tc.steps_json || []);
        const isApiOnly = steps.every(s => s.action?.startsWith('api_'));
        const fixture = isApiOnly ? 'request' : 'page';

        // Add test metadata as comments
        lines.push(`  // Priority: ${tc.priority} | Type: ${tc.test_type} | Role: ${tc.role}`);
        if (tc.preconditions) lines.push(`  // Preconditions: ${tc.preconditions}`);
        if (tc.expected_result) lines.push(`  // Expected: ${tc.expected_result}`);

        lines.push(`  test('${esc(tc.name)}', async ({ ${fixture} }) => {`);
        if (!isApiOnly) {
          lines.push(`    let previousUrl = '';`);
        }

        for (const step of steps) {
          const stepCode = this._stepToPlaywright(step, baseUrl, authHeaders);
          lines.push(stepCode);
        }

        lines.push(`  });`);
        lines.push(``);
      }

      lines.push(`});`);
      specFiles[`plan-${category}.spec.js`] = lines.join('\n');
    }

    return specFiles;
  }

  // Convert a single step to Playwright code
  _stepToPlaywright(step, baseUrl, authHeaders) {
    const lines = [];
    const indent = '    ';

    lines.push(`${indent}// ${step.action}: ${JSON.stringify(step).substring(0, 100)}`);
    lines.push(`${indent}try {`);

    switch (step.action) {
      case 'goto': {
        const url = `${baseUrl.replace(/\/$/, '')}${step.path || ''}`;
        lines.push(`${indent}  await page.goto('${esc(url)}', { waitUntil: 'networkidle', timeout: 30000 });`);
        lines.push(`${indent}  await page.waitForTimeout(1500);`);
        lines.push(`${indent}  previousUrl = page.url();`);
        break;
      }
      case 'click_link':
        lines.push(`${indent}  await page.getByRole('link', { name: '${esc(step.text)}' }).first().waitFor({ state: 'visible', timeout: 15000 });`);
        lines.push(`${indent}  await page.getByRole('link', { name: '${esc(step.text)}' }).first().click();`);
        lines.push(`${indent}  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});`);
        break;
      case 'click_button':
        lines.push(`${indent}  await page.getByRole('button', { name: '${esc(step.text)}' }).first().waitFor({ state: 'visible', timeout: 15000 });`);
        lines.push(`${indent}  previousUrl = page.url();`);
        lines.push(`${indent}  await page.getByRole('button', { name: '${esc(step.text)}' }).first().click();`);
        lines.push(`${indent}  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});`);
        lines.push(`${indent}  await page.waitForTimeout(1500);`);
        break;
      case 'fill': {
        const f = esc(step.field);
        const v = esc(step.value);
        lines.push(`${indent}  {`);
        lines.push(`${indent}    let filled = false;`);
        lines.push(`${indent}    const strategies = [`);
        lines.push(`${indent}      () => page.getByPlaceholder('${f}').first(),`);
        lines.push(`${indent}      () => page.getByLabel('${f}').first(),`);
        lines.push(`${indent}      () => page.locator('input[name="${f}" i], textarea[name="${f}" i]').first(),`);
        lines.push(`${indent}      () => page.locator('input[placeholder*="${f}" i]').first(),`);
        lines.push(`${indent}    ];`);
        lines.push(`${indent}    for (const strat of strategies) {`);
        lines.push(`${indent}      if (filled) break;`);
        lines.push(`${indent}      try { const el = strat(); if (await el.isVisible().catch(() => false)) { await el.fill('${v}'); filled = true; } } catch {}`);
        lines.push(`${indent}    }`);
        lines.push(`${indent}    if (!filled) throw new Error('Field not found: ${f}');`);
        lines.push(`${indent}  }`);
        break;
      }
      case 'select':
        lines.push(`${indent}  const sel = page.getByLabel('${esc(step.field)}').first();`);
        lines.push(`${indent}  await sel.selectOption({ label: '${esc(step.value)}' });`);
        break;
      case 'wait':
        lines.push(`${indent}  await page.waitForTimeout(${(step.seconds || 2) * 1000});`);
        break;
      case 'assert_url_contains':
        lines.push(`${indent}  expect(page.url().toLowerCase()).toContain('${esc(step.text)}'.toLowerCase());`);
        break;
      case 'assert_url_changed':
        lines.push(`${indent}  expect(page.url()).not.toBe(previousUrl);`);
        break;
      case 'assert_url_not_changed':
        lines.push(`${indent}  expect(page.url()).toBe(previousUrl);`);
        break;
      case 'assert_visible':
        lines.push(`${indent}  await expect(page.getByText('${esc(step.text)}').first()).toBeVisible({ timeout: 10000 });`);
        break;
      case 'assert_not_visible':
        lines.push(`${indent}  await expect(page.getByText('${esc(step.text)}').first()).not.toBeVisible({ timeout: 5000 });`);
        break;
      case 'assert_element_exists':
        lines.push(`${indent}  await expect(page.locator('${esc(step.selector)}').first()).toBeVisible({ timeout: 10000 });`);
        break;
      case 'assert_element_count':
        lines.push(`${indent}  expect(await page.locator('${esc(step.selector)}').count()).toBeGreaterThanOrEqual(${step.min || 1});`);
        break;
      case 'assert_page_has_text': {
        const pattern = esc(step.pattern || 'success|welcome|dashboard');
        lines.push(`${indent}  const bodyText = await page.locator('body').innerText();`);
        lines.push(`${indent}  expect(bodyText).toMatch(new RegExp('${pattern}', 'i'));`);
        break;
      }
      case 'screenshot':
        lines.push(`${indent}  await page.screenshot({ path: 'test-results/screenshots/${esc(step.name || 'screenshot')}.png' });`);
        break;
      case 'check_a11y':
        lines.push(`${indent}  // Accessibility check — basic automated a11y scan`);
        lines.push(`${indent}  const violations = await page.evaluate(() => {`);
        lines.push(`${indent}    const issues = [];`);
        lines.push(`${indent}    document.querySelectorAll('img:not([alt])').forEach(el => issues.push('img missing alt: ' + (el.src || '').substring(0, 80)));`);
        lines.push(`${indent}    document.querySelectorAll('input:not([aria-label]):not([id])').forEach(el => {`);
        lines.push(`${indent}      const hasLabel = el.id && document.querySelector('label[for="' + el.id + '"]');`);
        lines.push(`${indent}      if (!hasLabel && !el.getAttribute('aria-label')) issues.push('input missing label: ' + (el.name || el.type));`);
        lines.push(`${indent}    });`);
        lines.push(`${indent}    if (!document.querySelector('html[lang]')) issues.push('html missing lang attribute');`);
        lines.push(`${indent}    if (!document.querySelector('h1')) issues.push('page missing h1');`);
        lines.push(`${indent}    return issues;`);
        lines.push(`${indent}  });`);
        lines.push(`${indent}  if (violations.length > 0) console.log('[A11y] Issues:', violations.join('; '));`);
        lines.push(`${indent}  expect(violations.length, 'Accessibility violations: ' + violations.join('; ')).toBeLessThanOrEqual(${step.max_violations || 3});`);
        break;
      case 'measure_load_time': {
        const maxMs = step.max_ms || 5000;
        lines.push(`${indent}  const start = Date.now();`);
        lines.push(`${indent}  await page.goto('${esc(baseUrl)}${esc(step.path || '')}', { waitUntil: 'networkidle', timeout: 30000 });`);
        lines.push(`${indent}  const loadTime = Date.now() - start;`);
        lines.push(`${indent}  console.log('[Perf] Load time for ${esc(step.path || '/')}: ' + loadTime + 'ms');`);
        lines.push(`${indent}  expect(loadTime).toBeLessThan(${maxMs});`);
        break;
      }
      case 'api_get': {
        const hdrs = Object.keys(authHeaders).length > 0 ? `, { headers: ${JSON.stringify(authHeaders)} }` : '';
        lines.push(`${indent}  const resp = await request.get('${esc(baseUrl)}${esc(step.path)}'${hdrs});`);
        if (step.assert_status) lines.push(`${indent}  expect(resp.status()).toBe(${step.assert_status});`);
        break;
      }
      case 'api_post': {
        const hdrs = Object.keys(authHeaders).length > 0 ? `, headers: ${JSON.stringify(authHeaders)}` : '';
        lines.push(`${indent}  const resp = await request.post('${esc(baseUrl)}${esc(step.path)}', { data: ${JSON.stringify(step.body || {})}${hdrs} });`);
        if (step.assert_status) lines.push(`${indent}  expect(resp.status()).toBe(${step.assert_status});`);
        break;
      }
      default:
        lines.push(`${indent}  // Unknown action: ${step.action}`);
    }

    lines.push(`${indent}} catch (e) {`);
    lines.push(`${indent}  console.log('[Step failed] ${step.action}: ' + e.message.substring(0, 200));`);
    if (step.action?.startsWith('assert_') || step.action === 'check_a11y' || step.action === 'measure_load_time') {
      lines.push(`${indent}  throw e;`);
    }
    lines.push(`${indent}}`);
    lines.push(``);

    return lines.join('\n');
  }
}

function esc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

module.exports = { IntentEngine };
