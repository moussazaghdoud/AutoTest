// BFS page crawler (depth=3, max=100)

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

      results.push({
        url,
        title,
        status_code: status,
        response_time: elapsed,
        has_forms: formCount > 0 ? 1 : 0,
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
        error: err.message,
      });
    }
  }

  return results;
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
