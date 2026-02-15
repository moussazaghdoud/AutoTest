// Template: status codes, response format, timing

function generateApiTests(apis, baseUrl, authHeaders = {}) {
  if (!apis.length) return '';

  const tests = apis.map(a => {
    const urlStr = JSON.stringify(a.url);
    const method = a.method.toLowerCase();
    return `
  test('API ${a.method} ${escapeTest(a.url)} returns valid response', async ({ request }) => {
    const start = Date.now();
    const response = await request.${method}(${urlStr}, {
      headers: ${JSON.stringify(authHeaders)},
      timeout: 15000,
    });
    const elapsed = Date.now() - start;

    // Should not be a server error
    expect(response.status(), 'Server error').toBeLessThan(500);

    // Response time should be reasonable (< 5s)
    expect(elapsed, 'Response too slow: ' + elapsed + 'ms').toBeLessThan(5000);

    // If JSON, should be parseable
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('json')) {
      const body = await response.text();
      expect(() => JSON.parse(body), 'Invalid JSON').not.toThrow();
    }
  });`;
  }).join('\n');

  return `const { test, expect } = require('@playwright/test');

test.describe('API Tests', () => {
  test.setTimeout(30000);
${tests}
});
`;
}

function escapeTest(s) {
  return s.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

module.exports = { generateApiTests };
