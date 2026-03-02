const { defineConfig } = require('@playwright/test');
const path = require('path');

// Environment-driven config overrides
const retries = parseInt(process.env.PW_RETRIES || '2', 10);
const workers = parseInt(process.env.PW_WORKERS || '2', 10);
const trace = process.env.PW_TRACE || 'on-first-retry';
const video = process.env.PW_VIDEO || 'retain-on-failure';
const screenshot = process.env.PW_SCREENSHOT || 'on';
const artifactsDir = process.env.PW_ARTIFACTS_DIR || 'test-results';

module.exports = defineConfig({
  testDir: './generated-tests',
  timeout: 120000,
  retries,
  workers,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  outputDir: path.join(artifactsDir, 'pw-results'),

  reporter: [
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'test-results/results.json' }],
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(artifactsDir, 'html-report') }],
  ],

  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot,
    trace,
    video,
    // Sensible action timeouts
    actionTimeout: 15000,
    navigationTimeout: 30000,
    // Viewport
    viewport: { width: 1280, height: 720 },
  },
});
