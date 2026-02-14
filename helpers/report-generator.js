const fs = require('fs');
const path = require('path');

function generateReport(resultsPath, outputPath) {
  const raw = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const suites = raw.suites || [];

  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let slowTests = [];
  let failures = [];

  function walkSpecs(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        for (const result of test.results || []) {
          totalTests++;
          const duration = result.duration || 0;
          if (result.status === 'passed') passed++;
          else if (result.status === 'failed' || result.status === 'timedOut') {
            failed++;
            failures.push({
              title: spec.title,
              file: spec.file || suite.title,
              error: (result.errors || []).map(e => e.message || e.snippet || '').join('\n').slice(0, 300),
            });
          } else skipped++;

          if (duration > 3000) {
            slowTests.push({ title: spec.title, duration });
          }
        }
      }
    }
    for (const child of suite.suites || []) {
      walkSpecs(child);
    }
  }

  for (const suite of suites) {
    walkSpecs(suite);
  }

  const passRate = totalTests > 0 ? ((passed / totalTests) * 100).toFixed(1) : '0';
  const statusColor = failed === 0 ? '#4caf50' : '#f44336';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoTest — Summary Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { margin-bottom: 20px; color: #1a237e; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 30px; }
    .card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .card .value { font-size: 2em; font-weight: bold; }
    .card .label { font-size: 0.9em; color: #666; margin-top: 4px; }
    .pass { color: #4caf50; }
    .fail { color: #f44336; }
    .slow { color: #ff9800; }
    .section { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .section h2 { margin-bottom: 12px; font-size: 1.2em; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
    th { background: #fafafa; font-weight: 600; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; color: #fff; font-size: 0.85em; background: ${statusColor}; }
    .timestamp { color: #999; font-size: 0.85em; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AutoTest — Summary Report</h1>
    <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>

    <div class="summary-cards">
      <div class="card">
        <div class="value">${totalTests}</div>
        <div class="label">Total Tests</div>
      </div>
      <div class="card">
        <div class="value pass">${passed}</div>
        <div class="label">Passed</div>
      </div>
      <div class="card">
        <div class="value fail">${failed}</div>
        <div class="label">Failed</div>
      </div>
      <div class="card">
        <div class="value">${passRate}%</div>
        <div class="label">Pass Rate</div>
      </div>
      <div class="card">
        <div class="value slow">${slowTests.length}</div>
        <div class="label">Slow (&gt;3s)</div>
      </div>
    </div>

    <div class="section">
      <h2>Overall Status: <span class="status-badge">${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}</span></h2>
    </div>

    ${failures.length > 0 ? `
    <div class="section">
      <h2>Failures</h2>
      <table>
        <tr><th>Test</th><th>File</th><th>Error</th></tr>
        ${failures.map(f => `<tr><td>${escapeHtml(f.title)}</td><td>${escapeHtml(f.file)}</td><td><pre style="white-space:pre-wrap;font-size:0.8em">${escapeHtml(f.error)}</pre></td></tr>`).join('')}
      </table>
    </div>` : ''}

    ${slowTests.length > 0 ? `
    <div class="section">
      <h2>Slow Tests (&gt;3s)</h2>
      <table>
        <tr><th>Test</th><th>Duration</th></tr>
        ${slowTests.map(s => `<tr><td>${escapeHtml(s.title)}</td><td class="slow">${(s.duration / 1000).toFixed(1)}s</td></tr>`).join('')}
      </table>
    </div>` : ''}
  </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`\n--- Summary ---`);
  console.log(`Total: ${totalTests}  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Slow: ${slowTests.length}`);
  console.log(`Pass rate: ${passRate}%`);
  if (failures.length > 0) {
    console.log(`\nFailed tests:`);
    failures.forEach(f => console.log(`  - ${f.title} (${f.file})`));
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { generateReport };
