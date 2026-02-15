// Captures XHR/fetch during crawl + probes common API paths

async function interceptApis(page, baseUrl) {
  const captured = [];
  const baseOrigin = new URL(baseUrl).origin;

  // Listen for all network requests
  page.on('response', async (response) => {
    const request = response.request();
    const url = request.url();
    const resourceType = request.resourceType();

    // Only capture XHR/fetch requests (not images, stylesheets, etc.)
    if (resourceType !== 'xhr' && resourceType !== 'fetch') return;
    if (!url.startsWith(baseOrigin)) return;

    const contentType = response.headers()['content-type'] || '';
    captured.push({
      method: request.method(),
      url: url,
      response_status: response.status(),
      response_type: contentType.split(';')[0].trim(),
    });
  });

  return {
    getCaptured: () => deduplicateApis(captured),
    stop: () => page.removeAllListeners('response'),
  };
}

async function probeCommonApis(page, baseUrl) {
  const baseOrigin = new URL(baseUrl).origin;
  const commonPaths = [
    '/api', '/api/v1', '/api/v2',
    '/graphql',
    '/api/health', '/api/status',
    '/api/users', '/api/auth',
  ];

  const results = [];

  for (const p of commonPaths) {
    try {
      const url = baseOrigin + p;
      const response = await page.context().request.get(url, { timeout: 5000 });
      const contentType = response.headers()['content-type'] || '';

      if (response.status() < 500) {
        results.push({
          method: 'GET',
          url,
          response_status: response.status(),
          response_type: contentType.split(';')[0].trim(),
        });
      }
    } catch {
      // Ignore unreachable endpoints
    }
  }

  return results;
}

function deduplicateApis(apis) {
  const seen = new Set();
  return apis.filter(a => {
    const key = `${a.method}:${a.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { interceptApis, probeCommonApis, deduplicateApis };
