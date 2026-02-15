require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb, all, get, run } = require('./db/db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- SSE connections store ---
const sseClients = new Map();

function addSseClient(type, id, res) {
  const key = `${type}:${id}`;
  if (!sseClients.has(key)) sseClients.set(key, []);
  sseClients.get(key).push(res);

  // Keepalive ping every 15s to prevent Railway/proxy from closing idle connections
  const keepalive = setInterval(() => {
    try { res.write(':\n\n'); } catch { clearInterval(keepalive); }
  }, 15000);

  res.on('close', () => {
    clearInterval(keepalive);
    const arr = sseClients.get(key);
    if (arr) {
      const idx = arr.indexOf(res);
      if (idx !== -1) arr.splice(idx, 1);
      if (arr.length === 0) sseClients.delete(key);
    }
  });
}

function emitSse(type, id, event, data) {
  const key = `${type}:${id}`;
  const clients = sseClients.get(key);
  if (!clients) return;
  for (const res of clients) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// --- SSE endpoint ---
app.get('/api/events/:type/:id', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':\n\n');
  addSseClient(req.params.type, req.params.id, res);
});

// ========== TARGETS ==========

app.get('/api/targets', async (req, res) => {
  const db = await getDb();
  res.json(all(db, 'SELECT * FROM targets ORDER BY created_at DESC'));
});

app.post('/api/targets', async (req, res) => {
  const db = await getDb();
  const { name, base_url, auth_type, auth_config, settings } = req.body;
  if (!name || !base_url) return res.status(400).json({ error: 'name and base_url required' });
  const result = run(db,
    `INSERT INTO targets (name, base_url, auth_type, auth_config, settings) VALUES (?, ?, ?, ?, ?)`,
    [name, base_url, auth_type || 'none', JSON.stringify(auth_config || {}), JSON.stringify(settings || {})]
  );
  res.status(201).json(get(db, 'SELECT * FROM targets WHERE id = ?', [result.lastInsertRowid]));
});

app.get('/api/targets/:id', async (req, res) => {
  const db = await getDb();
  const target = get(db, 'SELECT * FROM targets WHERE id = ?', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Target not found' });
  res.json(target);
});

app.put('/api/targets/:id', async (req, res) => {
  const db = await getDb();
  const existing = get(db, 'SELECT * FROM targets WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Target not found' });
  const { name, base_url, auth_type, auth_config, settings } = req.body;
  run(db,
    `UPDATE targets SET name=?, base_url=?, auth_type=?, auth_config=?, settings=?, updated_at=datetime('now') WHERE id=?`,
    [
      name || existing.name,
      base_url || existing.base_url,
      auth_type || existing.auth_type,
      JSON.stringify(auth_config || JSON.parse(existing.auth_config || '{}')),
      JSON.stringify(settings || JSON.parse(existing.settings || '{}')),
      req.params.id,
    ]
  );
  res.json(get(db, 'SELECT * FROM targets WHERE id = ?', [req.params.id]));
});

app.delete('/api/targets/:id', async (req, res) => {
  const db = await getDb();
  const existing = get(db, 'SELECT * FROM targets WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Target not found' });
  run(db, 'DELETE FROM targets WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ========== SCANS (Discovery) ==========

app.get('/api/targets/:id/scans', async (req, res) => {
  const db = await getDb();
  res.json(all(db, 'SELECT * FROM scans WHERE target_id = ? ORDER BY created_at DESC', [req.params.id]));
});

app.post('/api/targets/:id/scan', async (req, res) => {
  const db = await getDb();
  const target = get(db, 'SELECT * FROM targets WHERE id = ?', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Target not found' });

  const result = run(db,
    `INSERT INTO scans (target_id, status, started_at) VALUES (?, 'running', datetime('now'))`,
    [req.params.id]
  );
  const scanId = result.lastInsertRowid;

  res.status(202).json({ scan_id: scanId, status: 'running' });

  // Run discovery asynchronously
  try {
    const { runDiscovery } = require('./engine/discovery-orchestrator');
    await runDiscovery(scanId, target, emitSse);
  } catch (err) {
    console.error('Discovery error:', err);
    run(db, `UPDATE scans SET status='error', stats=?, finished_at=datetime('now') WHERE id=?`,
      [JSON.stringify({ error: err.message }), scanId]);
    emitSse('scan', scanId, 'error', { message: err.message });
  }
});

app.get('/api/scans/:id', async (req, res) => {
  const db = await getDb();
  const scan = get(db, 'SELECT * FROM scans WHERE id = ?', [req.params.id]);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json(scan);
});

app.get('/api/scans/:id/pages', async (req, res) => {
  const db = await getDb();
  res.json(all(db, 'SELECT * FROM discovered_pages WHERE scan_id = ? ORDER BY url', [req.params.id]));
});

app.get('/api/scans/:id/apis', async (req, res) => {
  const db = await getDb();
  res.json(all(db, 'SELECT * FROM discovered_apis WHERE scan_id = ? ORDER BY url', [req.params.id]));
});

app.get('/api/scans/:id/forms', async (req, res) => {
  const db = await getDb();
  res.json(all(db, 'SELECT * FROM discovered_forms WHERE scan_id = ? ORDER BY page_url', [req.params.id]));
});

// ========== TEST RUNS ==========

app.post('/api/targets/:id/run', async (req, res) => {
  const db = await getDb();
  const target = get(db, 'SELECT * FROM targets WHERE id = ?', [req.params.id]);
  if (!target) return res.status(404).json({ error: 'Target not found' });

  const { scan_id, test_types, concurrency, ai_prompt, ai_only } = req.body;
  if (!scan_id) return res.status(400).json({ error: 'scan_id required' });

  const result = run(db,
    `INSERT INTO test_runs (target_id, scan_id, test_types, ai_prompt, status, started_at) VALUES (?, ?, ?, ?, 'running', datetime('now'))`,
    [req.params.id, scan_id, JSON.stringify(test_types || ['pages', 'apis']), ai_prompt || null]
  );
  const runId = result.lastInsertRowid;

  res.status(202).json({ run_id: runId, status: 'running' });

  // Run tests asynchronously
  try {
    const { generateTests } = require('./generator/test-generator');
    const { executeTests } = require('./runner/test-runner');
    const { collectResults } = require('./runner/result-collector');

    console.log(`[Run #${runId}] Generating tests for scan ${scan_id}, types: ${JSON.stringify(test_types)}, concurrency: ${concurrency}`);
    const generated = await generateTests(runId, scan_id, target, test_types || ['pages', 'apis'], concurrency, ai_prompt, ai_only);
    console.log(`[Run #${runId}] Generated: ${JSON.stringify(generated)}`);

    if (!generated || generated.length === 0) {
      console.log(`[Run #${runId}] No tests generated — marking as done with 0 results`);
      run(db, `UPDATE test_runs SET status='done', summary='{"total":0,"passed":0,"failed":0,"skipped":0}', finished_at=datetime('now') WHERE id=?`, [runId]);
      emitSse('run', runId, 'done', { summary: { total: 0 } });
      return;
    }

    // Count tests per spec file for category progress tracking
    const generatedDir = path.join(__dirname, 'generated-tests');
    const testCounts = {};
    let totalTests = 0;
    try {
      const specFiles = fs.readdirSync(generatedDir).filter(f => f.endsWith('.spec.js'));
      for (const file of specFiles) {
        const content = fs.readFileSync(path.join(generatedDir, file), 'utf-8');
        const matches = content.match(/test\(/g);
        const count = matches ? matches.length : 0;
        const category = file.replace('.spec.js', '');
        testCounts[category] = count;
        totalTests += count;
      }
    } catch (e) {
      console.log(`[Run #${runId}] Could not count tests:`, e.message);
    }

    emitSse('run', runId, 'generation_done', { categories: testCounts, total: totalTests });

    emitSse('run', runId, 'status', { phase: 'executing' });
    console.log(`[Run #${runId}] Executing tests...`);

    // Track progress for live streaming
    let completedCount = 0;
    const categoryProgress = {};
    for (const cat of Object.keys(testCounts)) {
      categoryProgress[cat] = { done: 0, total: testCounts[cat], passed: 0, failed: 0 };
    }

    const onTestResult = (event) => {
      if (event.type === 'total') {
        emitSse('run', runId, 'test_total', { total: event.total, workers: event.workers });
        return;
      }
      if (event.type === 'result') {
        completedCount++;
        const cat = event.category;
        if (categoryProgress[cat]) {
          categoryProgress[cat].done++;
          if (event.status === 'passed') categoryProgress[cat].passed++;
          else categoryProgress[cat].failed++;
        }
        emitSse('run', runId, 'test_result', {
          name: event.name,
          category: cat,
          status: event.status,
          duration: event.duration,
          completed: completedCount,
          total: totalTests,
          categoryProgress,
        });
      }
    };

    const jsonPath = await executeTests(runId, onTestResult);
    console.log(`[Run #${runId}] Execution done, JSON at: ${jsonPath}`);

    emitSse('run', runId, 'status', { phase: 'collecting' });
    await collectResults(runId, jsonPath);

    const updatedRun = get(db, 'SELECT * FROM test_runs WHERE id = ?', [runId]);
    console.log(`[Run #${runId}] Final summary: ${updatedRun.summary}`);
    emitSse('run', runId, 'done', { summary: JSON.parse(updatedRun.summary || '{}') });
  } catch (err) {
    console.error(`[Run #${runId}] ERROR:`, err);
    run(db, `UPDATE test_runs SET status='error', summary=?, finished_at=datetime('now') WHERE id=?`,
      [JSON.stringify({ error: err.message }), runId]);
    emitSse('run', runId, 'error', { message: err.message });
  }
});

app.get('/api/runs/:id', async (req, res) => {
  const db = await getDb();
  const r = get(db, 'SELECT * FROM test_runs WHERE id = ?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Run not found' });
  res.json(r);
});

app.get('/api/runs/:id/results', async (req, res) => {
  const db = await getDb();
  res.json(all(db, 'SELECT * FROM test_results WHERE run_id = ? ORDER BY category, test_name', [req.params.id]));
});

// ========== HISTORY & TRENDS ==========

app.get('/api/targets/:id/trends', async (req, res) => {
  const db = await getDb();
  const runs = all(db,
    `SELECT id, status, summary, started_at, finished_at, test_types, ai_prompt
     FROM test_runs WHERE target_id = ? AND status = 'done' ORDER BY started_at ASC`,
    [req.params.id]
  );

  const trends = runs.map(r => {
    const summary = JSON.parse(r.summary || '{}');
    return {
      run_id: r.id,
      date: r.started_at,
      total: summary.total || 0,
      passed: summary.passed || 0,
      failed: summary.failed || 0,
      skipped: summary.skipped || 0,
      pass_rate: summary.total ? Math.round((summary.passed / summary.total) * 100) : 0,
      ai_prompt: r.ai_prompt || null,
    };
  });
  res.json(trends);
});

// ========== REPORT EXPORT ==========

app.get('/api/runs/:id/report', async (req, res) => {
  const db = await getDb();
  const r = get(db, 'SELECT * FROM test_runs WHERE id = ?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Run not found' });

  const results = all(db, 'SELECT * FROM test_results WHERE run_id = ? ORDER BY category, test_name', [req.params.id]);
  const target = get(db, 'SELECT * FROM targets WHERE id = ?', [r.target_id]);
  const summary = JSON.parse(r.summary || '{}');

  const html = generateReportHtml(target, r, results, summary);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="autotest-report-${r.id}.html"`);
  res.send(html);
});

function generateReportHtml(target, run, results, summary) {
  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  let categoryHtml = '';
  for (const [cat, items] of Object.entries(byCategory)) {
    const rows = items.map(r => `
      <tr class="${r.status}">
        <td>${esc(r.test_name)}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${r.duration || '-'}ms</td>
        <td>${esc(r.error_message || '')}</td>
      </tr>`).join('');
    categoryHtml += `<h3>${esc(cat)}</h3><table><thead><tr><th>Test</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AutoTest Report #${run.id}</title>
<style>
  body{font-family:system-ui;max-width:900px;margin:40px auto;padding:0 20px;color:#1a1a2e}
  h1{color:#16213e}h2{border-bottom:2px solid #0f3460;padding-bottom:8px}h3{color:#0f3460}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e0e0e0}
  th{background:#f5f5f5;font-weight:600}
  .badge{padding:2px 10px;border-radius:12px;font-size:13px;font-weight:500}
  .badge.passed{background:#d4edda;color:#155724}
  .badge.failed{background:#f8d7da;color:#721c24}
  .badge.skipped{background:#fff3cd;color:#856404}
  tr.failed{background:#fff5f5}
  .summary{display:flex;gap:20px;margin:16px 0}
  .stat{background:#f8f9fa;padding:16px 24px;border-radius:8px;text-align:center}
  .stat .num{font-size:28px;font-weight:700}.stat .label{font-size:13px;color:#666}
</style></head><body>
<h1>AutoTest Report</h1>
<h2>${esc(target.name)} — Run #${run.id}</h2>
<p><strong>URL:</strong> ${esc(target.base_url)}<br>
<strong>Date:</strong> ${run.started_at || run.created_at}<br>
<strong>Types:</strong> ${run.test_types}</p>
<div class="summary">
  <div class="stat"><div class="num">${summary.total || 0}</div><div class="label">Total</div></div>
  <div class="stat"><div class="num" style="color:#155724">${summary.passed || 0}</div><div class="label">Passed</div></div>
  <div class="stat"><div class="num" style="color:#721c24">${summary.failed || 0}</div><div class="label">Failed</div></div>
  <div class="stat"><div class="num" style="color:#856404">${summary.skipped || 0}</div><div class="label">Skipped</div></div>
</div>
${categoryHtml}
<p style="color:#999;font-size:12px;margin-top:40px">Generated by AutoTest v2</p>
</body></html>`;
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== SPA Fallback ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await getDb();
  app.listen(PORT, () => {
    console.log(`AutoTest dashboard running at http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
