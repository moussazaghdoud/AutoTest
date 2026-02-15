// Runs `npx playwright test generated-tests/`
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated-tests');
const RESULTS_DIR = path.join(PROJECT_ROOT, 'test-results');

// Strip ANSI escape codes from a string
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

async function executeTests(runId, onTestResult) {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const jsonPath = path.join(RESULTS_DIR, `run-${runId}.json`);

  const testFiles = fs.readdirSync(GENERATED_DIR).filter(f => f.endsWith('.spec.js'));
  if (testFiles.length === 0) {
    throw new Error('No test files generated');
  }

  console.log(`Executing ${testFiles.length} test files for run #${runId}...`);

  return new Promise((resolve, reject) => {
    // Use the main playwright.config.js but override JSON output path via env var
    const cmd = `npx playwright test`;

    const child = exec(cmd, {
      cwd: PROJECT_ROOT,
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath,
      },
    });

    let stdout = '';
    let stderr = '';
    let lineBuffer = '';

    child.stdout.on('data', (data) => {
      stdout += data;
      process.stdout.write(data);

      // Line-buffer for real-time parsing
      if (onTestResult) {
        lineBuffer += data;
        const lines = lineBuffer.split('\n');
        // Keep the last incomplete line in the buffer
        lineBuffer = lines.pop();
        for (const rawLine of lines) {
          parseTestLine(rawLine, onTestResult);
        }
      }
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      // Flush remaining buffer
      if (onTestResult && lineBuffer.trim()) {
        parseTestLine(lineBuffer, onTestResult);
      }

      console.log(`Playwright exited with code ${code}`);

      if (fs.existsSync(jsonPath)) {
        console.log(`JSON results at ${jsonPath}`);
        resolve(jsonPath);
      } else {
        console.log('No JSON file found, using fallback...');
        const fallback = parseFallbackOutput(stdout + '\n' + stderr);
        fs.writeFileSync(jsonPath, JSON.stringify(fallback));
        resolve(jsonPath);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Playwright execution failed: ${err.message}`));
    });
  });
}

function parseTestLine(rawLine, onTestResult) {
  const line = stripAnsi(rawLine).trim();
  if (!line) return;

  // Match: "Running N tests using M workers"
  const totalMatch = line.match(/Running (\d+) tests? using (\d+) workers?/i);
  if (totalMatch) {
    onTestResult({ type: 'total', total: parseInt(totalMatch[1]), workers: parseInt(totalMatch[2]) });
    return;
  }

  // Match passed: "✓  N [file.spec.js:line] › Suite › Test Name (Xms)"
  // Also handles: "✓  N file.spec.js:line › Suite › Test Name (Xms)"
  const passMatch = line.match(/[✓✔]\s+\d+\s+[\["]?([^:\]]+(?:\.spec\.js)?)[:\d\]]*\s+›\s+(.+?)\s+\((\d+)ms\)/);
  if (passMatch) {
    const fullName = passMatch[2].trim();
    const parts = fullName.split(' › ');
    const category = extractCategory(passMatch[1], parts);
    const testName = parts[parts.length - 1] || fullName;
    onTestResult({ type: 'result', name: testName, category, status: 'passed', duration: parseInt(passMatch[3]) });
    return;
  }

  // Match failed: "✘  N [file.spec.js:line] › Suite › Test Name (Xms)"
  const failMatch = line.match(/[✘✗×]\s+\d+\s+[\["]?([^:\]]+(?:\.spec\.js)?)[:\d\]]*\s+›\s+(.+?)\s+\((\d+)ms\)/);
  if (failMatch) {
    const fullName = failMatch[2].trim();
    const parts = fullName.split(' › ');
    const category = extractCategory(failMatch[1], parts);
    const testName = parts[parts.length - 1] || fullName;
    onTestResult({ type: 'result', name: testName, category, status: 'failed', duration: parseInt(failMatch[3]) });
    return;
  }

  // Broader fallback: any line with › and (Xms)
  const genericMatch = line.match(/\s+\d+\s+[\["]?([^:\]]+(?:\.spec\.js)?)[:\d\]]*\s+›\s+(.+?)\s+\((\d+)ms\)/);
  if (genericMatch) {
    const fullName = genericMatch[2].trim();
    const parts = fullName.split(' › ');
    const category = extractCategory(genericMatch[1], parts);
    const testName = parts[parts.length - 1] || fullName;
    const status = line.match(/[✘✗×]/) ? 'failed' : 'passed';
    onTestResult({ type: 'result', name: testName, category, status, duration: parseInt(genericMatch[3]) });
  }
}

function extractCategory(filename, parts) {
  // Try to get category from filename: pages.spec.js → pages, apis.spec.js → apis
  const fileBase = filename.replace(/\.spec\.js.*/, '').replace(/.*[\\/]/, '');
  const knownCategories = ['pages', 'apis', 'security', 'forms', 'load'];
  if (knownCategories.includes(fileBase)) return fileBase;
  // Or from suite name (first part before ›)
  if (parts.length > 1) {
    const suite = parts[0].toLowerCase();
    for (const cat of knownCategories) {
      if (suite.includes(cat)) return cat;
    }
  }
  return fileBase || 'other';
}

function parseFallbackOutput(output) {
  const passMatch = output.match(/(\d+) passed/);
  const failMatch = output.match(/(\d+) failed/);
  const skipMatch = output.match(/(\d+) skipped/);

  return {
    suites: [],
    stats: {
      expected: passMatch ? parseInt(passMatch[1]) : 0,
      unexpected: failMatch ? parseInt(failMatch[1]) : 0,
      skipped: skipMatch ? parseInt(skipMatch[1]) : 0,
    },
    _fallback: true,
  };
}

module.exports = { executeTests };
