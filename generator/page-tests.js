// Template: page loads, console errors, broken links

function generatePageTests(pages, baseUrl) {
  if (!pages.length) return '';

  const pageTests = pages.map(p => {
    const urlStr = JSON.stringify(p.url);
    return `
  test('Page loads: ${escapeTest(p.url)}', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    const response = await page.goto(${urlStr}, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(response.status()).toBeLessThan(500);
    expect(errors.length, 'Console errors: ' + errors.join('; ')).toBe(0);
  });`;
  }).join('\n');

  // Broken links test — checks all <a> links on pages
  const samplePages = pages.slice(0, 10); // Check links on first 10 pages
  const linkTests = samplePages.map(p => {
    const urlStr = JSON.stringify(p.url);
    return `
  test('No broken links on: ${escapeTest(p.url)}', async ({ page, request }) => {
    await page.goto(${urlStr}, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const links = await page.$$eval('a[href]', anchors =>
      anchors.map(a => a.href).filter(h => h.startsWith('http'))
    );
    const unique = [...new Set(links)].slice(0, 20);
    const broken = [];
    for (const link of unique) {
      try {
        const resp = await request.head(link, { timeout: 10000 });
        if (resp.status() >= 400) broken.push(link + ' (' + resp.status() + ')');
      } catch { /* skip unreachable */ }
    }
    expect(broken, 'Broken links: ' + broken.join(', ')).toHaveLength(0);
  });`;
  }).join('\n');

  return `const { test, expect } = require('@playwright/test');

test.describe('Page Tests', () => {
  test.setTimeout(60000);
${pageTests}
${linkTests}
});
`;
}

function escapeTest(s) {
  return s.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

module.exports = { generatePageTests };
