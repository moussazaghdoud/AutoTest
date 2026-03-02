// Dashboard overview — main landing page with stats, recent runs, trends
const DashboardOverview = {
  init() {},

  async load() {
    const container = document.getElementById('dashboardOverview');
    container.innerHTML = '<div class="empty-state"><div class="spinner" style="width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto"></div><p style="margin-top:12px">Loading dashboard...</p></div>';

    try {
      const data = await API.get('/api/dashboard/overview');
      container.innerHTML = this.render(data);
    } catch (err) {
      container.innerHTML = Components.emptyState('Error loading dashboard', err.message);
    }
  },

  render(data) {
    const s = data.overallStats;
    const passRateColor = s.avgPassRate >= 80 ? 'var(--success)' : s.avgPassRate >= 50 ? 'var(--warning)' : 'var(--danger)';

    let html = `
      <div class="results-summary" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="num">${s.totalRuns}</div>
          <div class="label">Total Runs</div>
        </div>
        <div class="stat-card">
          <div class="num">${s.totalTests}</div>
          <div class="label">Tests Executed</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:${passRateColor}">${s.avgPassRate}%</div>
          <div class="label">Pass Rate</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:var(--warning)">${s.flakyCount}</div>
          <div class="label">Flaky Tests</div>
        </div>
        <div class="stat-card">
          <div class="num">${data.targets}</div>
          <div class="label">Targets</div>
        </div>
      </div>
    `;

    // Recent runs table
    if (data.recentRuns.length > 0) {
      html += `<h3 style="margin-bottom:12px">Recent Runs</h3>`;
      html += `<div class="table-wrap"><table>
        <thead><tr>
          <th>Run</th><th>Target</th><th>Total</th><th>Passed</th><th>Failed</th><th>Rate</th><th>Date</th><th>Actions</th>
        </tr></thead><tbody>`;

      for (const r of data.recentRuns) {
        const s = r.summary || {};
        const rate = s.total ? Math.round((s.passed / s.total) * 100) : 0;
        const rateBadge = rate >= 80 ? 'badge-success' : rate >= 50 ? 'badge-warning' : 'badge-danger';
        const date = r.startedAt ? new Date(r.startedAt).toLocaleString() : '-';
        const sha = r.gitSha ? `<span class="badge badge-muted" style="font-family:monospace;font-size:11px">${r.gitSha.substring(0, 7)}</span>` : '';

        html += `<tr>
          <td><strong>#${r.id}</strong> ${sha}</td>
          <td>${esc(r.targetName)}</td>
          <td>${s.total || 0}</td>
          <td style="color:var(--success)">${s.passed || 0}</td>
          <td style="color:var(--danger)">${s.failed || 0}</td>
          <td><span class="badge ${rateBadge}">${rate}%</span></td>
          <td style="font-size:12px;color:var(--text-secondary)">${date}</td>
          <td>
            <button class="btn btn-sm" onclick="DashboardOverview.viewRun(${r.id})">Details</button>
            <a href="/api/runs/${r.id}/report" class="btn btn-sm" target="_blank">Report</a>
          </td>
        </tr>`;
      }

      html += `</tbody></table></div>`;
    } else {
      html += Components.emptyState('No test runs yet', 'Add a target, run discovery, and execute tests to see results here.');
    }

    return html;
  },

  async viewRun(runId) {
    const overlay = document.getElementById('drilldownOverlay');
    const title = document.getElementById('drilldownTitle');
    const content = document.getElementById('drilldownContent');

    title.textContent = `Run #${runId} Details`;
    content.innerHTML = '<p>Loading...</p>';
    overlay.classList.add('open');

    try {
      const results = await API.get(`/api/runs/${runId}/results`);
      const run = await API.get(`/api/runs/${runId}`);
      const summary = JSON.parse(run.summary || '{}');

      let html = `
        <div class="results-summary" style="margin-bottom:16px">
          <div class="stat-card"><div class="num">${summary.total || 0}</div><div class="label">Total</div></div>
          <div class="stat-card"><div class="num" style="color:var(--success)">${summary.passed || 0}</div><div class="label">Passed</div></div>
          <div class="stat-card"><div class="num" style="color:var(--danger)">${summary.failed || 0}</div><div class="label">Failed</div></div>
          <div class="stat-card"><div class="num" style="color:var(--warning)">${summary.skipped || 0}</div><div class="label">Skipped</div></div>
        </div>
      `;

      // Group by category
      const cats = {};
      for (const r of results) {
        if (!cats[r.category]) cats[r.category] = [];
        cats[r.category].push(r);
      }

      for (const [cat, items] of Object.entries(cats)) {
        html += `<h4 style="margin:16px 0 8px;text-transform:capitalize">${esc(cat)}</h4>`;
        html += `<div class="table-wrap"><table><thead><tr><th>Test</th><th>Status</th><th>Duration</th><th>Retries</th><th>Error</th></tr></thead><tbody>`;

        for (const r of items) {
          const statusBadge = r.status === 'passed' ? 'badge-success' : r.status === 'failed' ? 'badge-danger' : 'badge-warning';
          const flakyTag = r.is_flaky ? ' <span class="badge badge-warning" style="font-size:10px">FLAKY</span>' : '';
          html += `<tr>
            <td>${esc(r.test_name)}${flakyTag}</td>
            <td><span class="badge ${statusBadge}">${r.status}</span></td>
            <td>${r.duration || '-'}ms</td>
            <td>${r.retry_count || 0}</td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--danger)">${esc((r.error_message || '').substring(0, 200))}</td>
          </tr>`;
        }
        html += `</tbody></table></div>`;
      }

      // Show defect summaries for failures
      const failures = results.filter(r => r.status === 'failed' && r.defect_summary);
      if (failures.length > 0) {
        html += `<h4 style="margin:20px 0 8px">Defect Analysis</h4>`;
        for (const f of failures) {
          html += `<div class="card" style="margin-bottom:8px;padding:12px">
            <div style="font-weight:600;margin-bottom:4px">${esc(f.test_name)}</div>
            <pre style="font-size:12px;white-space:pre-wrap;color:var(--text-secondary);margin:0">${esc(f.defect_summary)}</pre>
          </div>`;
        }
      }

      content.innerHTML = html;
    } catch (err) {
      content.innerHTML = `<p style="color:var(--danger)">Error: ${esc(err.message)}</p>`;
    }
  },
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
