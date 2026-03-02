// Migrate database from v2 to v3 schema — safe to run multiple times
const fs = require('fs');
const path = require('path');
const { getDb, run, get } = require('./db');

async function migrateToV3() {
  const db = await getDb();
  console.log('[Migrate] Starting v3 migration...');

  // Helper: add column if it doesn't exist
  function addColumnIfMissing(table, column, type, defaultVal) {
    try {
      get(db, `SELECT ${column} FROM ${table} LIMIT 1`);
    } catch {
      const def = defaultVal !== undefined ? ` DEFAULT ${typeof defaultVal === 'string' ? `'${defaultVal}'` : defaultVal}` : '';
      run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${type}${def}`);
      console.log(`[Migrate] Added ${table}.${column}`);
    }
  }

  // Extend test_runs
  addColumnIfMissing('test_runs', 'plan_id', 'INTEGER', null);
  addColumnIfMissing('test_runs', 'environment', 'TEXT', 'default');
  addColumnIfMissing('test_runs', 'git_sha', 'TEXT', null);
  addColumnIfMissing('test_runs', 'git_branch', 'TEXT', null);
  addColumnIfMissing('test_runs', 'browser', 'TEXT', 'chromium');
  addColumnIfMissing('test_runs', 'retry_policy', 'TEXT', '{"maxRetries":2,"backoff":"linear"}');
  addColumnIfMissing('test_runs', 'artifacts_path', 'TEXT', null);

  // Extend test_results
  addColumnIfMissing('test_results', 'retry_count', 'INTEGER', 0);
  addColumnIfMissing('test_results', 'is_flaky', 'INTEGER', 0);
  addColumnIfMissing('test_results', 'is_quarantined', 'INTEGER', 0);
  addColumnIfMissing('test_results', 'severity', 'TEXT', 'normal');
  addColumnIfMissing('test_results', 'feature_area', 'TEXT', null);
  addColumnIfMissing('test_results', 'screenshot_path', 'TEXT', null);
  addColumnIfMissing('test_results', 'trace_path', 'TEXT', null);
  addColumnIfMissing('test_results', 'video_path', 'TEXT', null);
  addColumnIfMissing('test_results', 'console_logs', 'TEXT', null);
  addColumnIfMissing('test_results', 'network_logs', 'TEXT', null);
  addColumnIfMissing('test_results', 'steps_json', 'TEXT', null);
  addColumnIfMissing('test_results', 'defect_summary', 'TEXT', null);

  // Extend targets
  addColumnIfMissing('targets', 'environment', 'TEXT', 'default');

  // Create new tables
  const newTables = fs.readFileSync(path.join(__dirname, 'schema-v3.sql'), 'utf8');

  // Extract only CREATE TABLE statements for new tables
  const createStatements = newTables.match(/CREATE TABLE IF NOT EXISTS (?:test_plans|test_plan_cases|flaky_tests|artifacts|environments|auth_sessions|coverage_entries)\s*\([^;]+\);/g);
  if (createStatements) {
    for (const stmt of createStatements) {
      try {
        run(db, stmt);
      } catch (e) {
        // Table might already exist, that's fine
        if (!e.message.includes('already exists')) {
          console.log(`[Migrate] Warning: ${e.message}`);
        }
      }
    }
  }

  // Insert default environment
  try {
    run(db, `INSERT OR IGNORE INTO environments (name, is_default) VALUES ('default', 1)`);
  } catch { /* ignore */ }

  console.log('[Migrate] v3 migration complete');
}

module.exports = { migrateToV3 };

// Run directly: node db/migrate-v3.js
if (require.main === module) {
  migrateToV3().catch(console.error);
}
