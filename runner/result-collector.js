// Parses JSON output → DB
const fs = require('fs');
const { getDb, run, all } = require('../db/db');

async function collectResults(runId, jsonPath) {
  const db = await getDb();
  let data;

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    // If JSON parsing fails, mark run as error
    run(db, `UPDATE test_runs SET status='error', summary=?, finished_at=datetime('now') WHERE id=?`,
      [JSON.stringify({ error: 'Failed to parse test results: ' + err.message }), runId]);
    return;
  }

  // Handle Playwright JSON reporter format
  if (data.suites) {
    collectFromSuites(db, runId, data.suites);
  }

  // Handle fallback format
  if (data._fallback) {
    const stats = data.stats || {};
    const total = (stats.expected || 0) + (stats.unexpected || 0) + (stats.skipped || 0);
    if (total > 0) {
      // Insert summary results
      for (let i = 0; i < (stats.expected || 0); i++) {
        run(db, `INSERT INTO test_results (run_id, category, test_name, status, duration) VALUES (?, ?, ?, ?, ?)`,
          [runId, 'general', `Test ${i + 1}`, 'passed', 0]);
      }
      for (let i = 0; i < (stats.unexpected || 0); i++) {
        run(db, `INSERT INTO test_results (run_id, category, test_name, status, duration) VALUES (?, ?, ?, ?, ?)`,
          [runId, 'general', `Failed Test ${i + 1}`, 'failed', 0]);
      }
    }
  }

  // Calculate summary
  const results = all(db, 'SELECT * FROM test_results WHERE run_id = ?', [runId]);
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  run(db, `UPDATE test_runs SET status='done', summary=?, finished_at=datetime('now') WHERE id=?`,
    [JSON.stringify(summary), runId]);

  console.log(`Run #${runId} complete:`, summary);
}

function collectFromSuites(db, runId, suites, parentTitle = '') {
  for (const suite of suites) {
    const category = suite.title || parentTitle || 'general';

    // Process specs (test cases)
    if (suite.specs) {
      for (const spec of suite.specs) {
        const testName = spec.title || 'unnamed';
        let status = 'skipped';
        let duration = 0;
        let errorMessage = '';

        if (spec.tests && spec.tests.length > 0) {
          const test = spec.tests[0];
          const result = test.results && test.results[0];
          if (result) {
            status = result.status === 'passed' ? 'passed'
                   : result.status === 'failed' ? 'failed'
                   : result.status === 'skipped' ? 'skipped'
                   : 'failed';
            duration = result.duration || 0;
            if (result.error) {
              errorMessage = result.error.message || result.error.toString();
              // Truncate long errors
              if (errorMessage.length > 500) errorMessage = errorMessage.substring(0, 500) + '...';
            }
          }
        }

        // Map category from file name
        const cat = mapCategory(category);
        run(db, `INSERT INTO test_results (run_id, category, test_name, status, duration, error_message)
                 VALUES (?, ?, ?, ?, ?, ?)`,
          [runId, cat, testName, status, duration, errorMessage || null]);
      }
    }

    // Recurse into nested suites
    if (suite.suites) {
      collectFromSuites(db, runId, suite.suites, suite.title || parentTitle);
    }
  }
}

function mapCategory(title) {
  const lower = title.toLowerCase();
  if (lower.includes('page')) return 'pages';
  if (lower.includes('api')) return 'apis';
  if (lower.includes('security')) return 'security';
  if (lower.includes('form')) return 'forms';
  if (lower.includes('load')) return 'load';
  return title;
}

module.exports = { collectResults };
