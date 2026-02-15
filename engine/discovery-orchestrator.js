// Coordinates full scan pipeline
const { chromium } = require('@playwright/test');
const { getDb, run, all } = require('../db/db');
const { crawlPages } = require('./crawler');
const { interceptApis, probeCommonApis } = require('./api-interceptor');
const { detectForms } = require('./form-detector');
const { detectAuthPage } = require('./auth-detector');
const { classifyPages, classifyApis, classifyForms } = require('./classifier');

async function runDiscovery(scanId, target, emitSse) {
  const db = await getDb();
  const baseUrl = target.base_url;
  const authType = target.auth_type || 'none';
  const authConfig = JSON.parse(target.auth_config || '{}');

  let browser;
  try {
    emitSse('scan', scanId, 'progress', { percent: 5, message: 'Launching browser...' });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'AutoTest/2.0 Discovery Scanner',
    });

    // Handle auth if configured
    const page = await context.newPage();
    await authenticate(page, context, baseUrl, authType, authConfig);

    emitSse('scan', scanId, 'progress', { percent: 10, message: 'Starting API interceptor...' });

    // Set up API interception
    const interceptor = await interceptApis(page, baseUrl);

    emitSse('scan', scanId, 'progress', { percent: 15, message: 'Crawling pages...' });

    // Crawl pages (BFS)
    const rawPages = await crawlPages(page, baseUrl, 3, 100);

    emitSse('scan', scanId, 'progress', { percent: 50, message: `Found ${rawPages.length} pages. Detecting forms...` });

    // Detect forms and auth pages on each discovered page
    const allForms = [];
    for (let i = 0; i < rawPages.length; i++) {
      const p = rawPages[i];
      try {
        await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 10000 });

        // Detect forms
        const forms = await detectForms(page, p.url);
        allForms.push(...forms);
        if (forms.length > 0) p.has_forms = 1;

        // Detect auth page
        const isAuth = await detectAuthPage(page, p.url);
        p.is_auth_page = isAuth ? 1 : 0;
      } catch {
        // Skip erroring pages
      }

      if (i % 5 === 0) {
        const pct = 50 + Math.round((i / rawPages.length) * 20);
        emitSse('scan', scanId, 'progress', { percent: pct, message: `Analyzing page ${i + 1}/${rawPages.length}...` });
      }
    }

    emitSse('scan', scanId, 'progress', { percent: 75, message: 'Probing common API paths...' });

    // Get intercepted APIs + probe common paths
    interceptor.stop();
    const capturedApis = interceptor.getCaptured();
    const probedApis = await probeCommonApis(page, baseUrl);
    const rawApis = [...capturedApis, ...probedApis];

    emitSse('scan', scanId, 'progress', { percent: 85, message: 'Classifying and storing results...' });

    // Classify and deduplicate
    const pages = classifyPages(rawPages);
    const apis = classifyApis(rawApis);
    const forms = classifyForms(allForms);

    // Store in DB
    for (const p of pages) {
      run(db,
        `INSERT INTO discovered_pages (scan_id, url, title, status_code, response_time, has_forms, is_auth_page, ui_elements)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [scanId, p.url, p.title, p.status_code, p.response_time, p.has_forms, p.is_auth_page || 0, JSON.stringify(p.ui_elements || {})]
      );
      emitSse('scan', scanId, 'page', { url: p.url, status: p.status_code });
    }

    for (const a of apis) {
      run(db,
        `INSERT INTO discovered_apis (scan_id, method, url, response_status, response_type, requires_auth)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [scanId, a.method, a.url, a.response_status, a.response_type, a.requires_auth || 0]
      );
      emitSse('scan', scanId, 'api', { method: a.method, url: a.url });
    }

    for (const f of forms) {
      run(db,
        `INSERT INTO discovered_forms (scan_id, page_url, action, method, fields, is_login_form)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [scanId, f.page_url, f.action, f.method, f.fields, f.is_login_form || 0]
      );
      emitSse('scan', scanId, 'form', { page_url: f.page_url, action: f.action });
    }

    // Update scan status
    const stats = {
      pages: pages.length,
      apis: apis.length,
      forms: forms.length,
      auth_pages: pages.filter(p => p.is_auth_page).length,
    };
    run(db, `UPDATE scans SET status='done', stats=?, finished_at=datetime('now') WHERE id=?`,
      [JSON.stringify(stats), scanId]);

    emitSse('scan', scanId, 'done', stats);

    await browser.close();
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    run(db, `UPDATE scans SET status='error', stats=?, finished_at=datetime('now') WHERE id=?`,
      [JSON.stringify({ error: err.message }), scanId]);
    emitSse('scan', scanId, 'error', { message: err.message });
    throw err;
  }
}

async function authenticate(page, context, baseUrl, authType, config) {
  if (authType === 'none') return;

  if (authType === 'form') {
    const loginUrl = config.login_url
      ? (config.login_url.startsWith('http') ? config.login_url : baseUrl + config.login_url)
      : baseUrl + '/login';
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (config.username_selector && config.username) {
      await page.fill(config.username_selector, config.username);
    }
    if (config.password_selector && config.password) {
      await page.fill(config.password_selector, config.password);
    }
    if (config.submit_selector) {
      await page.click(config.submit_selector);
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  if (authType === 'basic') {
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    await context.setExtraHTTPHeaders({ Authorization: `Basic ${credentials}` });
  }

  if (authType === 'bearer') {
    let token = config.token;
    if (!token && config.login_api && config.username && config.password) {
      // Get token from login API
      const loginUrl = config.login_api.startsWith('http') ? config.login_api : baseUrl + config.login_api;
      const response = await page.context().request.post(loginUrl, {
        data: { email: config.username, username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await response.json();
      // Extract token from response using path
      token = getNestedValue(body, config.token_path || 'token');
    }
    if (token) {
      await context.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });
    }
  }

  if (authType === 'cookie') {
    if (config.cookie_name && config.cookie_value) {
      const url = new URL(baseUrl);
      await context.addCookies([{
        name: config.cookie_name,
        value: config.cookie_value,
        domain: url.hostname,
        path: '/',
      }]);
    }
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
}

module.exports = { runDiscovery };
