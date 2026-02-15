// BFS page crawler (depth=3, max=100) — captures UI elements for AI context
// Supports SPAs: clicks navigation elements to discover client-side routes

async function crawlPages(page, baseUrl, maxDepth = 3, maxPages = 100) {
  const visited = new Set();
  const results = [];
  const queue = [{ url: normalizeUrl(baseUrl), depth: 0 }];
  const baseOrigin = new URL(baseUrl).origin;

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();
    const normalizedForVisit = url.replace(/#.*$/, ''); // track without hash for dedup of non-hash URLs
    if (visited.has(url) || visited.has(normalizedForVisit)) continue;
    visited.add(url);
    visited.add(normalizedForVisit);

    try {
      const start = Date.now();
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const elapsed = Date.now() - start;
      const status = response ? response.status() : 0;

      // Wait for JS frameworks to render dynamic content (SPA support)
      await page.waitForTimeout(1200);

      // Get title
      const title = await page.title().catch(() => '');

      // Check for forms
      const formCount = await page.$$eval('form', forms => forms.length).catch(() => 0);

      // Capture UI elements for AI context
      const uiElements = await captureUiElements(page).catch(() => ({}));
      if (uiElements.buttons?.length || uiElements.inputs?.length) {
        console.log(`[Crawler] ${url} — ${uiElements.buttons?.length || 0} buttons, ${uiElements.inputs?.length || 0} inputs, ${uiElements.links?.length || 0} links, ${uiElements.headings?.length || 0} headings`);
      }

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
        // 1. Traditional <a href> links
        const links = await page.$$eval('a[href]', (anchors, origin) => {
          return anchors
            .map(a => {
              try {
                const href = a.getAttribute('href') || '';
                // Keep hash routes like #/signup, #!/page, etc.
                if (href.startsWith('#') && href.length > 1) {
                  return origin + '/' + href;
                }
                return new URL(a.href, origin).href;
              } catch { return null; }
            })
            .filter(href => href && href.startsWith(origin));
        }, baseOrigin).catch(() => []);

        for (const link of links) {
          const normalized = normalizeUrl(link);
          if (!visited.has(normalized) && normalized.startsWith(baseOrigin)) {
            queue.push({ url: normalized, depth: depth + 1 });
          }
        }

        // 2. SPA route discovery: click navigation elements and capture route changes
        if (depth === 0) {
          const spaRoutes = await discoverSpaRoutes(page, baseUrl, baseOrigin).catch(() => []);
          console.log(`[Crawler] SPA route discovery found ${spaRoutes.length} additional routes`);
          for (const route of spaRoutes) {
            if (!visited.has(route) && route.startsWith(baseOrigin)) {
              queue.push({ url: route, depth: depth + 1 });
            }
          }
        }
      }
    } catch (err) {
      console.log(`[Crawler] Error on ${url}: ${err.message}`);
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

// Click on nav buttons/links to discover SPA routes that don't use <a href>
async function discoverSpaRoutes(page, baseUrl, baseOrigin) {
  const discoveredRoutes = new Set();
  const startUrl = page.url();

  try {
    // Find all clickable navigation elements (nav links, buttons in header/nav, etc.)
    const clickTargets = await page.evaluate(() => {
      const targets = [];

      // Links and buttons inside nav, header, or with navigation-like roles
      const navSelectors = [
        'nav a', 'nav button',
        'header a', 'header button',
        '[role="navigation"] a', '[role="navigation"] button',
        '.navbar a', '.nav a', '.menu a', '.sidebar a',
        '.nav-link', '.menu-item', '.nav-item a',
      ];

      const seen = new Set();
      for (const selector of navSelectors) {
        for (const el of document.querySelectorAll(selector)) {
          const text = (el.textContent || '').trim().substring(0, 50);
          const tag = el.tagName.toLowerCase();
          const href = el.getAttribute('href') || '';
          // Skip empty, anchor-only, or already-seen
          if (!text || seen.has(text)) continue;
          if (href === '#' || href === '' || href === 'javascript:void(0)') {
            // These are likely SPA navigation — worth clicking
            seen.add(text);
            targets.push({ text, tag, index: targets.length });
          }
        }
      }

      // Also get standalone buttons/links that look like navigation (CTA buttons, etc.)
      const ctaSelectors = [
        'a.btn', 'a.button', 'button.cta',
        '[class*="get-started"]', '[class*="sign-up"]', '[class*="signup"]',
        '[class*="register"]', '[class*="login"]', '[class*="pricing"]',
      ];
      for (const selector of ctaSelectors) {
        for (const el of document.querySelectorAll(selector)) {
          const text = (el.textContent || '').trim().substring(0, 50);
          if (!text || seen.has(text)) continue;
          seen.add(text);
          targets.push({ text, tag: el.tagName.toLowerCase(), index: targets.length });
        }
      }

      return targets;
    });

    console.log(`[Crawler] Found ${clickTargets.length} navigation targets to click`);

    // Click each target and see if the URL changes
    for (const target of clickTargets.slice(0, 15)) {
      try {
        // Navigate back to starting page first
        if (page.url() !== startUrl) {
          await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(500);
        }

        // Try to find and click the element by its text
        const el = target.tag === 'a'
          ? page.getByRole('link', { name: target.text }).first()
          : page.getByRole('button', { name: target.text }).first();

        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;

        await el.click({ timeout: 5000 });
        await page.waitForTimeout(1500); // Wait for SPA route change

        const newUrl = page.url();
        if (newUrl !== startUrl && newUrl.startsWith(baseOrigin)) {
          discoveredRoutes.add(normalizeUrl(newUrl));
          console.log(`[Crawler] SPA click "${target.text}" → ${newUrl}`);
        }
      } catch {
        // Skip click errors
      }
    }

    // Go back to start
    if (page.url() !== startUrl) {
      await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    }
  } catch (err) {
    console.log(`[Crawler] SPA discovery error: ${err.message}`);
  }

  return Array.from(discoveredRoutes);
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
    // Keep hash routes (e.g. #/signup) but strip empty hashes
    if (u.hash === '#' || u.hash === '') {
      u.hash = '';
    }
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
