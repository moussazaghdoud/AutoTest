// Live page scout — visits the target right before AI test generation
// Captures real UI elements from every reachable page by clicking through the app
const { chromium } = require('@playwright/test');

async function scoutTarget(baseUrl) {
  console.log(`[Scout] Starting live exploration of ${baseUrl}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'AutoTest/2.0 PageScout',
    });
    const page = await context.newPage();

    const scoutedPages = [];
    const visitedUrls = new Set();
    const baseOrigin = new URL(baseUrl).origin;

    // Step 1: Visit the homepage and capture everything
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    const homepageData = await capturePage(page);
    scoutedPages.push(homepageData);
    visitedUrls.add(homepageData.url);
    console.log(`[Scout] Homepage: ${homepageData.ui_elements.buttons.length} buttons, ${homepageData.ui_elements.inputs.length} inputs, ${homepageData.ui_elements.links.length} links, ${homepageData.ui_elements.headings.length} headings`);

    // Step 2: Collect all clickable targets from the homepage
    const clickTargets = await page.evaluate(() => {
      const targets = [];
      const seen = new Set();

      // All links
      for (const el of document.querySelectorAll('a[href]')) {
        const text = (el.textContent || '').trim().substring(0, 60);
        const href = el.getAttribute('href') || '';
        if (text && !seen.has(text) && href !== '#' && href !== '') {
          seen.add(text);
          targets.push({ text, tag: 'a', href });
        }
      }

      // All buttons
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
    for (const target of clickTargets.slice(0, 20)) {
      try {
        // Make sure we're on the homepage
        const currentUrl = page.url();
        if (currentUrl !== homeUrl) {
          await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(1000);
        }

        // Find and click the element
        let locator;
        if (target.tag === 'a') {
          locator = page.getByRole('link', { name: target.text }).first();
        } else {
          locator = page.getByRole('button', { name: target.text }).first();
        }

        const isVisible = await locator.isVisible().catch(() => false);
        if (!isVisible) continue;

        await locator.click({ timeout: 5000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);

        const newUrl = page.url();
        // Only capture if this is a new page within the same origin
        if (!visitedUrls.has(newUrl) && newUrl.startsWith(baseOrigin)) {
          const pageData = await capturePage(page);
          scoutedPages.push(pageData);
          visitedUrls.add(newUrl);
          console.log(`[Scout] Clicked "${target.text}" → ${newUrl} — ${pageData.ui_elements.buttons.length} buttons, ${pageData.ui_elements.inputs.length} inputs`);
        }
      } catch {
        // Skip click errors silently
      }
    }

    // Step 4: Also try common SPA paths directly
    const commonPaths = ['/login', '/signin', '/signup', '/register', '/pricing', '/plans', '/about', '/contact', '/dashboard'];
    for (const pathSuffix of commonPaths) {
      const fullUrl = baseUrl.replace(/\/$/, '') + pathSuffix;
      if (visitedUrls.has(fullUrl)) continue;
      try {
        const resp = await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 10000 });
        if (resp && resp.status() < 400) {
          await page.waitForTimeout(1000);
          const actualUrl = page.url();
          if (!visitedUrls.has(actualUrl) && actualUrl.startsWith(baseOrigin)) {
            const pageData = await capturePage(page);
            // Only add if this page has meaningful content (not just a redirect to home)
            if (pageData.ui_elements.inputs.length > 0 || pageData.ui_elements.buttons.length > 2) {
              scoutedPages.push(pageData);
              visitedUrls.add(actualUrl);
              console.log(`[Scout] Direct path ${pathSuffix} → ${actualUrl} — ${pageData.ui_elements.buttons.length} buttons, ${pageData.ui_elements.inputs.length} inputs`);
            }
          }
        }
      } catch {
        // Skip
      }
    }

    await browser.close();
    console.log(`[Scout] Done — captured ${scoutedPages.length} pages total`);
    return scoutedPages;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`[Scout] Error: ${err.message}`);
    return [];
  }
}

async function capturePage(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');

  const uiElements = await page.evaluate(() => {
    const txt = (el) => (el.textContent || '').trim().substring(0, 80);
    const unique = (arr) => [...new Set(arr)].filter(Boolean);

    // Buttons
    const buttons = unique(
      Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
        .filter(el => el.offsetParent !== null) // visible only
        .map(el => {
          const text = txt(el) || el.value || el.getAttribute('aria-label') || '';
          return text.substring(0, 60);
        })
    ).slice(0, 25);

    // Inputs (visible only)
    const inputs = Array.from(document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="number"], input[type="search"], input[type="url"], input:not([type]), textarea'
    ))
      .filter(el => el.offsetParent !== null)
      .map(el => {
        const label = el.getAttribute('aria-label')
          || el.getAttribute('placeholder')
          || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim())
          || el.name
          || '';
        return {
          type: el.type || el.tagName.toLowerCase(),
          placeholder: el.placeholder || '',
          label: label.substring(0, 60),
          name: el.name || '',
        };
      }).slice(0, 25);

    // Links (visible, with text)
    const links = unique(
      Array.from(document.querySelectorAll('a[href]'))
        .filter(el => el.offsetParent !== null)
        .map(el => txt(el))
        .filter(t => t.length > 1 && t.length < 60)
    ).slice(0, 25);

    // Headings
    const headings = unique(
      Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .map(el => txt(el))
        .filter(t => t.length > 1)
    ).slice(0, 15);

    // Selects
    const selects = Array.from(document.querySelectorAll('select'))
      .filter(el => el.offsetParent !== null)
      .map(el => {
        const label = el.getAttribute('aria-label')
          || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim())
          || el.name || '';
        const options = Array.from(el.options).slice(0, 10).map(o => o.textContent.trim());
        return { label: label.substring(0, 60), options };
      }).slice(0, 10);

    // Key visible text snippets (paragraphs, spans in main content)
    const textSnippets = unique(
      Array.from(document.querySelectorAll('main p, .content p, section p, [class*="description"], [class*="subtitle"]'))
        .map(el => txt(el))
        .filter(t => t.length > 10 && t.length < 200)
    ).slice(0, 5);

    return { buttons, inputs, links, headings, selects, textSnippets };
  });

  return { url, title, status_code: 200, ui_elements: uiElements };
}

module.exports = { scoutTarget };
