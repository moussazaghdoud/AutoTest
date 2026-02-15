// Live page scout — visits the target right before AI test generation
// Captures real UI elements + screenshots from every reachable page
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'public', 'screenshots');

async function scoutTarget(baseUrl) {
  console.log(`[Scout] Starting live exploration of ${baseUrl}`);
  const scoutStart = Date.now();
  const SCOUT_TIMEOUT = 45000;
  let browser;

  // Clean and create screenshots directory
  const runDir = path.join(SCREENSHOTS_DIR, 'latest');
  if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'AutoTest/2.0 PageScout',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    const scoutedPages = [];
    const visitedUrls = new Set();
    const baseOrigin = new URL(baseUrl).origin;
    let screenshotIndex = 0;

    // Step 1: Visit the homepage and capture everything
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    const homepageData = await capturePage(page);
    homepageData.screenshot = await takeScreenshot(page, runDir, screenshotIndex++, 'homepage');
    scoutedPages.push(homepageData);
    visitedUrls.add(homepageData.url);
    console.log(`[Scout] Homepage: ${homepageData.ui_elements.buttons.length} buttons, ${homepageData.ui_elements.inputs.length} inputs, ${homepageData.ui_elements.links.length} links`);

    // Step 2: Collect all clickable targets from the homepage
    const clickTargets = await page.evaluate(() => {
      const targets = [];
      const seen = new Set();

      for (const el of document.querySelectorAll('a[href]')) {
        const text = (el.textContent || '').trim().substring(0, 60);
        const href = el.getAttribute('href') || '';
        if (text && !seen.has(text) && href !== '#' && href !== '') {
          seen.add(text);
          targets.push({ text, tag: 'a', href });
        }
      }

      for (const el of document.querySelectorAll('button, [role="button"], input[type="submit"]')) {
        const text = (el.textContent || el.value || '').trim().substring(0, 60);
        if (text && !seen.has(text)) {
          seen.add(text);
          targets.push({ text, tag: 'button', href: '' });
        }
      }

      return targets;
    });

    console.log(`[Scout] Found ${clickTargets.length} clickable elements to explore`);

    // Step 3: Click each target and capture the resulting page
    const homeUrl = page.url();
    for (const target of clickTargets.slice(0, 12)) {
      if (Date.now() - scoutStart > SCOUT_TIMEOUT) { console.log('[Scout] Timeout reached'); break; }
      try {
        const currentUrl = page.url();
        if (currentUrl !== homeUrl) {
          await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(1000);
        }

        let locator;
        if (target.tag === 'a') {
          locator = page.getByRole('link', { name: target.text }).first();
        } else {
          locator = page.getByRole('button', { name: target.text }).first();
        }

        const isVisible = await locator.isVisible().catch(() => false);
        if (!isVisible) continue;

        await locator.click({ timeout: 3000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(800);

        const newUrl = page.url();
        if (!visitedUrls.has(newUrl) && newUrl.startsWith(baseOrigin)) {
          const pageData = await capturePage(page);
          const slug = target.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
          pageData.screenshot = await takeScreenshot(page, runDir, screenshotIndex++, slug);
          scoutedPages.push(pageData);
          visitedUrls.add(newUrl);
          console.log(`[Scout] Clicked "${target.text}" → ${newUrl} — ${pageData.ui_elements.buttons.length} buttons, ${pageData.ui_elements.inputs.length} inputs`);
        }
      } catch {
        // Skip
      }
    }

    // Step 4: Common paths
    const commonPaths = ['/login', '/signin', '/signup', '/register', '/pricing', '/plans'];
    for (const pathSuffix of commonPaths) {
      if (Date.now() - scoutStart > SCOUT_TIMEOUT) break;
      const fullUrl = baseUrl.replace(/\/$/, '') + pathSuffix;
      if (visitedUrls.has(fullUrl)) continue;
      try {
        const resp = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 10000 });
        if (resp && resp.status() < 400) {
          await page.waitForTimeout(1000);
          const actualUrl = page.url();
          if (!visitedUrls.has(actualUrl) && actualUrl.startsWith(baseOrigin)) {
            const pageData = await capturePage(page);
            if (pageData.ui_elements.inputs.length > 0 || pageData.ui_elements.buttons.length > 2) {
              pageData.screenshot = await takeScreenshot(page, runDir, screenshotIndex++, pathSuffix.replace('/', ''));
              scoutedPages.push(pageData);
              visitedUrls.add(actualUrl);
              console.log(`[Scout] Path ${pathSuffix} → ${actualUrl}`);
            }
          }
        }
      } catch {
        // Skip
      }
    }

    await browser.close();
    console.log(`[Scout] Done — ${scoutedPages.length} pages, ${screenshotIndex} screenshots`);
    return scoutedPages;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`[Scout] Error: ${err.message}`);
    return [];
  }
}

async function takeScreenshot(page, dir, index, label) {
  try {
    const filename = `${String(index).padStart(2, '0')}-${label}.png`;
    const filepath = path.join(dir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    return `/screenshots/latest/${filename}`;
  } catch {
    return null;
  }
}

async function capturePage(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');

  const uiElements = await page.evaluate(() => {
    const txt = (el) => (el.textContent || '').trim().substring(0, 80);
    const unique = (arr) => [...new Set(arr)].filter(Boolean);

    const buttons = unique(
      Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
        .filter(el => el.offsetParent !== null)
        .map(el => (txt(el) || el.value || el.getAttribute('aria-label') || '').substring(0, 60))
    ).slice(0, 25);

    const inputs = Array.from(document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="number"], input[type="search"], input[type="url"], input:not([type]), textarea'
    )).filter(el => el.offsetParent !== null).map(el => ({
      type: el.type || el.tagName.toLowerCase(),
      placeholder: el.placeholder || '',
      label: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) || el.name || '').substring(0, 60),
      name: el.name || '',
    })).slice(0, 25);

    const links = unique(
      Array.from(document.querySelectorAll('a[href]'))
        .filter(el => el.offsetParent !== null)
        .map(el => txt(el)).filter(t => t.length > 1 && t.length < 60)
    ).slice(0, 25);

    const headings = unique(
      Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .map(el => txt(el)).filter(t => t.length > 1)
    ).slice(0, 15);

    const selects = Array.from(document.querySelectorAll('select'))
      .filter(el => el.offsetParent !== null).map(el => ({
        label: (el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) || el.name || '').substring(0, 60),
        options: Array.from(el.options).slice(0, 10).map(o => o.textContent.trim()),
      })).slice(0, 10);

    const textSnippets = unique(
      Array.from(document.querySelectorAll('main p, .content p, section p, [class*="description"], [class*="subtitle"]'))
        .map(el => txt(el)).filter(t => t.length > 10 && t.length < 200)
    ).slice(0, 5);

    return { buttons, inputs, links, headings, selects, textSnippets };
  });

  return { url, title, status_code: 200, ui_elements: uiElements };
}

module.exports = { scoutTarget };
