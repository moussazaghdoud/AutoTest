#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { program } = require('commander');
const { execSync } = require('child_process');
const fs = require('fs');

program
  .option('--suite <suite>', 'Test suite to run (all|public|auth|client|admin|security|load)', 'all')
  .option('--url <url>', 'Target application URL')
  .option('--concurrency <n>', 'Number of concurrent users for load tests', parseInt)
  .parse();

const opts = program.opts();

if (opts.url) process.env.BASE_URL = opts.url;
if (opts.concurrency) process.env.CONCURRENT_USERS = String(opts.concurrency);

const suiteMap = {
  public: 'tests/public/',
  auth: 'tests/auth/',
  client: 'tests/client-portal/',
  admin: 'tests/admin/',
  security: 'tests/security/',
  load: 'tests/load/',
  all: 'tests/',
};

const testDir = suiteMap[opts.suite];
if (!testDir) {
  console.error(`Unknown suite: ${opts.suite}. Options: ${Object.keys(suiteMap).join(', ')}`);
  process.exit(1);
}

const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

console.log(`\n=== AutoTest — Rainbow Portal ===`);
console.log(`Suite:       ${opts.suite}`);
console.log(`URL:         ${opts.url || process.env.BASE_URL || 'http://localhost:3000'}`);
console.log(`Concurrency: ${opts.concurrency || process.env.CONCURRENT_USERS || 3}`);
console.log(`================================\n`);

try {
  execSync(`npx playwright test ${testDir} --config=playwright.config.js`, {
    stdio: 'inherit',
    env: { ...process.env },
    cwd: __dirname,
  });
} catch (e) {
  // Playwright exits with non-zero on test failures — that's expected
}

// Generate summary report
try {
  const { generateReport } = require('./helpers/report-generator');
  const resultsPath = path.join(reportsDir, 'results.json');
  if (fs.existsSync(resultsPath)) {
    generateReport(resultsPath, path.join(reportsDir, 'summary.html'));
    console.log(`\nSummary report: reports/summary.html`);
  }
} catch (e) {
  console.error('Could not generate summary report:', e.message);
}

console.log(`Detailed report: reports/playwright-report/index.html\n`);
