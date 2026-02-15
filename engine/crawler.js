// BFS page crawler (depth=3, max=100) — captures UI elements for AI context

async function crawlPages(page, baseUrl, maxDepth = 3, maxPages = 100) {
  const visited = new Set();
  const results = [];
  const queue = [{ url: normalizeUrl(baseUrl), depth: 0 }];
  const baseOrigin = new URL(baseUrl).origin;

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);

    try {
      const start = Date.now();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const elapsed = Date.now() - start;
      const status = response ? response.status() : 0;

      // Get title
      const title = await page.title().catch(() => '');

      // Check for forms
      const formCount = await page.$$eval('form', forms => forms.length).catch(() => 0);

      // Capture UI elements for AI context
      const uiElements = await captureUiElements(page).catch(() => ({}));

      results.push({
        url,
        title,
        status_code: status,
        response_time: elapsed,
        has_forms: formCount > 0 ? 1 : 0,
        ui_elements: uiElements,
      });

      // Extract links for BFS
      if (depth < maxDepth) {
        const links = await page.$$eval('a[href]', (anchors, origin) => {
          return anchors
            .map(a => {
              try { return new URL(a.href, origin).href; } catch { return null; }
            })
            .filter(href => href && href.startsWith(origin));
        }, baseOrigin).catch(() => []);

        for (const link of links) {
          const normalized = normalizeUrl(link);
          if (!visited.has(normalized) && normalized.startsWith(baseOrigin)) {
            queue.push({ url: normalized, depth: depth + 1 });
          }
        }
      }
    } catch (err) {
      results.push({
        url,
        title: '',
        status_code: 0,
        response_time: 0,
        has_forms: 0,
        ui_elements: {},
        error: err.message,
      });
    }
  }

  return results;
}

async function captureUiElements(page) {
  return await page.evaluate(() => {
    const txt = (el) => (el.textContent || '').trim().substring(0, 80);
    const unique = (arr) => [...new Set(arr)].filter(Boolean);

    // Buttons: <button>, input[type=submit], [role=button]
    const buttons = unique(
      Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
        .map(el => {
          const text = txt(el) || el.value || el.getAttribute('aria-label') || '';
          return text.substring(0, 60);
        })
    ).slice(0, 20);

    // Inputs: text, email, password, tel, number, search, url
    const inputs = Array.from(document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="number"], input[type="search"], input[type="url"], input:not([type]), textarea'
    )).map(el => {
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
    }).slice(0, 20);

    // Links with visible text
    const links = unique(
      Array.from(document.querySelectorAll('a[href]'))
        .map(el => txt(el))
        .filter(t => t.length > 1 && t.length < 60)
    ).slice(0, 20);

    // Headings
    const headings = unique(
      Array.from(document.querySelectorAll('h1, h2, h3'))
        .map(el => txt(el))
        .filter(t => t.length > 1)
    ).slice(0, 10);

    // Select dropdowns
    const selects = Array.from(document.querySelectorAll('select')).map(el => {
      const label = el.getAttribute('aria-label')
        || (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim())
        || el.name || '';
      const options = Array.from(el.options).slice(0, 8).map(o => o.textContent.trim());
      return { label: label.substring(0, 60), options };
    }).slice(0, 10);

    return { buttons, inputs, links, headings, selects };
  });
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // Remove trailing slash for consistency (except root)
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return url;
  }
}

module.exports = { crawlPages };
