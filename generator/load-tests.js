// Template: concurrent user simulation

function generateLoadTests(pages, apis, baseUrl, concurrency = 3) {
  const endpoints = [];

  // Add page URLs
  for (const p of pages.slice(0, 10)) {
    endpoints.push({ type: 'page', url: p.url });
  }

  // Add API endpoints
  for (const a of apis.filter(a => a.method === 'GET').slice(0, 10)) {
    endpoints.push({ type: 'api', method: a.method, url: a.url });
  }

  if (endpoints.length === 0) return '';

  const endpointsJson = JSON.stringify(endpoints, null, 2);

  return `const { test, expect } = require('@playwright/test');

const CONCURRENCY = ${concurrency};
const ENDPOINTS = ${endpointsJson};

test.describe('Load Tests', () => {
  test.setTimeout(120000);

  test('Concurrent page loads (${concurrency} users)', async ({ browser }) => {
    const pages = ENDPOINTS.filter(e => e.type === 'page');
    if (pages.length === 0) return;

    const contexts = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => browser.newContext())
    );

    const results = [];

    for (const ep of pages) {
      const promises = contexts.map(async (ctx) => {
        const page = await ctx.newPage();
        const start = Date.now();
        try {
          const response = await page.goto(ep.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          return { url: ep.url, status: response.status(), time: Date.now() - start, error: null };
        } catch (err) {
          return { url: ep.url, status: 0, time: Date.now() - start, error: err.message };
        } finally {
          await page.close();
        }
      });

      results.push(...await Promise.all(promises));
    }

    for (const ctx of contexts) await ctx.close();

    const errors = results.filter(r => r.error || r.status >= 500);
    const times = results.filter(r => !r.error).map(r => r.time).sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] || 0;
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    console.log('Load test results:', { total: results.length, errors: errors.length, p95, avg });

    expect(errors.length, 'Server errors under load: ' + errors.map(e => e.url).join(', ')).toBeLessThan(results.length * 0.2);
    expect(p95, 'p95 response time too high: ' + p95 + 'ms').toBeLessThan(10000);
  });

  test('Concurrent API requests (${concurrency} users)', async ({ request }) => {
    const apiEndpoints = ENDPOINTS.filter(e => e.type === 'api');
    if (apiEndpoints.length === 0) return;

    const results = [];

    for (const ep of apiEndpoints) {
      const promises = Array.from({ length: CONCURRENCY }, async () => {
        const start = Date.now();
        try {
          const response = await request.get(ep.url, { timeout: 15000 });
          return { url: ep.url, status: response.status(), time: Date.now() - start, error: null };
        } catch (err) {
          return { url: ep.url, status: 0, time: Date.now() - start, error: err.message };
        }
      });

      results.push(...await Promise.all(promises));
    }

    const errors = results.filter(r => r.error || r.status >= 500);
    const times = results.filter(r => !r.error).map(r => r.time).sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] || 0;
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    console.log('API load test results:', { total: results.length, errors: errors.length, p95, avg });

    expect(errors.length, 'API errors under load').toBeLessThan(results.length * 0.2);
    expect(p95, 'API p95 too high: ' + p95 + 'ms').toBeLessThan(10000);
  });
});
`;
}

module.exports = { generateLoadTests };
