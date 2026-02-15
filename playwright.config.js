const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './generated-tests',
  timeout: 120000,
  retries: 0,
  workers: 2,
  reporter: [
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
});
