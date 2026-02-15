// Entry: reads DB, writes spec files to generated-tests/
const fs = require('fs');
const path = require('path');
const { getDb, all } = require('../db/db');
const { generatePageTests } = require('./page-tests');
const { generateApiTests } = require('./api-tests');
const { generateSecurityTests } = require('./security-tests');
const { generateFormTests } = require('./form-tests');
const { generateLoadTests } = require('./load-tests');
const { generateAiTests } = require('./ai-tests');

const OUTPUT_DIR = path.join(__dirname, '..', 'generated-tests');

async function generateTests(runId, scanId, target, testTypes, concurrency = 3, aiPrompt = null, aiOnly = false) {
  const db = await getDb();

  // Clean output dir
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load discovered data
  const pages = all(db, 'SELECT * FROM discovered_pages WHERE scan_id = ?', [scanId]);
  const apis = all(db, 'SELECT * FROM discovered_apis WHERE scan_id = ?', [scanId]);
  const forms = all(db, 'SELECT * FROM discovered_forms WHERE scan_id = ?', [scanId]);

  const baseUrl = target.base_url;
  const authConfig = JSON.parse(target.auth_config || '{}');
  const authHeaders = {};
  if (target.auth_type === 'basic' && authConfig.username) {
    authHeaders['Authorization'] = `Basic ${Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64')}`;
  }
  if (target.auth_type === 'bearer' && authConfig.token) {
    authHeaders['Authorization'] = `Bearer ${authConfig.token}`;
  }

  const generated = [];

  // When aiOnly, skip all standard test generation — only AI tests below
  if (aiOnly) {
    console.log(`[Run #${runId}] AI-only mode — skipping standard test generation`);
  }

  if (!aiOnly && testTypes.includes('pages') && pages.length > 0) {
    const code = generatePageTests(pages, baseUrl);
    if (code) {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'pages.spec.js'), code);
      generated.push('pages');
    }
  }

  if (!aiOnly && testTypes.includes('apis') && apis.length > 0) {
    const code = generateApiTests(apis, baseUrl, authHeaders);
    if (code) {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'apis.spec.js'), code);
      generated.push('apis');
    }
  }

  if (!aiOnly && testTypes.includes('security')) {
    const code = generateSecurityTests(pages, apis, baseUrl);
    if (code) {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'security.spec.js'), code);
      generated.push('security');
    }
  }

  if (!aiOnly && testTypes.includes('forms') && forms.length > 0) {
    const code = generateFormTests(forms, baseUrl);
    if (code) {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'forms.spec.js'), code);
      generated.push('forms');
    }
  }

  if (!aiOnly && testTypes.includes('load')) {
    const code = generateLoadTests(pages, apis, baseUrl, concurrency);
    if (code) {
      fs.writeFileSync(path.join(OUTPUT_DIR, 'load.spec.js'), code);
      generated.push('load');
    }
  }

  // AI-generated custom tests from user prompt
  if (aiPrompt && aiPrompt.trim()) {
    try {
      console.log(`[Run #${runId}] Generating AI tests from prompt: "${aiPrompt.substring(0, 80)}..."`);
      const code = await generateAiTests(aiPrompt, {
        baseUrl,
        pages,
        apis,
        forms,
        authHeaders,
      });
      if (code) {
        fs.writeFileSync(path.join(OUTPUT_DIR, 'custom.spec.js'), code);
        generated.push('custom');
        console.log(`[Run #${runId}] AI custom tests generated successfully`);
      }
    } catch (err) {
      console.error(`[Run #${runId}] AI test generation failed: ${err.message}`);
      // In aiOnly mode, re-throw so the run reports the error instead of silently finishing with 0 tests
      if (aiOnly) {
        throw new Error(`AI test generation failed: ${err.message}`);
      }
      // Otherwise continue with standard tests
    }
  }

  console.log(`Generated test files: ${generated.join(', ')} (${generated.length} files)`);
  return generated;
}

module.exports = { generateTests };
