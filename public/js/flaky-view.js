// Flakiness monitor — tracks tests with high retry/failure rates
const FlakyView = {
  init() {},

  async loadTargetSelect() {
    const targets = await API.get('/api/targets');
    const select = document.getElementById('flakyTargetSelect');
    select.innerHTML = targets.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    if (targets.length > 0) {
      this.load(targets[0].id);
      select.addEventListener('change', () => this.load(select.value));
    }
  },

  async load(targetId) {
    const container = document.getElementById('flakyContent');

    try {
      const flakyTests = await API.get(`/api/targets/${targetId}/flaky`);

      if (flakyTests.length === 0) {
        container.innerHTML = `<div class="empty-state">
          <h3>No flaky test data yet</h3>
          <p>Run tests multiple times to build flakiness statistics. Tests that fail intermittently will appear here.</p>
        </div>`;
        return;
      }

      // Stats summary
      const totalFlaky = flakyTests.filter(t => t.flake_rate > 0.2).length;
      const quarantined = flakyTests.filter(t => t.is_quarantined).length;
      const avgFlakeRate = flakyTests.length > 0
        ? Math.round((flakyTests.reduce((s, t) => s + t.flake_rate, 0) / flakyTests.length) * 100)
        : 0;

      let html = `
        <div class="results-summary" style="margin-bottom:20px">
          <div class="stat-card">
            <div class="num">${flakyTests.length}</div>
            <div class="label">Tracked Tests</div>
          </div>
          <div class="stat-card">
            <div class="num" style="color:var(--warning)">${totalFlaky}</div>
            <div class="label">Flaky (&gt;20%)</div>
          </div>
          <div class="stat-card">
            <div class="num" style="color:var(--danger)">${quarantined}</div>
            <div class="label">Quarantined</div>
          </div>
          <div class="stat-card">
            <div class="num">${avgFlakeRate}%</div>
            <div class="label">Avg Flake Rate</div>
          </div>
        </div>
      `;

      // Flaky tests table
      html += `<div class="table-wrap"><table>
        <thead><tr>
          <th>Test Name</th><th>Category</th><th>Runs</th><th>Failures</th><th>Retries</th><th>Flake Rate</th><th>Status</th><th>Last Failure</th><th>Actions</th>
        </tr></thead><tbody>`;

      // Sort by flake rate descending
      const sorted = [...flakyTests].sort((a, b) => b.flake_rate - a.flake_rate);

      for (const t of sorted) {
        const rate = Math.round(t.flake_rate * 100);
        const rateBadge = rate >= 50 ? 'badge-danger' : rate >= 20 ? 'badge-warning' : 'badge-success';
        const statusBadge = t.is_quarantined ? '<span class="badge badge-danger">Quarantined</span>' : '<span class="badge badge-success">Active</span>';
        const lastFail = t.last_failure_at ? new Date(t.last_failure_at).toLocaleDateString() : '-';
        const qAction = t.is_quarantined
          ? `<button class="btn btn-sm" onclick="FlakyView.toggleQuarantine(${t.id}, 'unquarantine')">Unquarantine</button>`
          : `<button class="btn btn-sm btn-danger" onclick="FlakyView.toggleQuarantine(${t.id}, 'quarantine')">Quarantine</button>`;

        // Flake rate bar
        const barColor = rate >= 50 ? 'var(--danger)' : rate >= 20 ? 'var(--warning)' : 'var(--success)';

        html += `<tr${t.is_quarantined ? ' style="opacity:0.6"' : ''}>
          <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(t.test_name)}">${esc(t.test_name)}</td>
          <td><span class="badge badge-info" style="font-size:10px">${esc(t.category)}</span></td>
          <td>${t.total_runs}</td>
          <td style="color:var(--danger)">${t.total_failures}</td>
          <td>${t.total_retries}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;min-width:60px">
                <div style="height:100%;width:${rate}%;background:${barColor};border-radius:3px"></div>
              </div>
              <span class="badge ${rateBadge}" style="font-size:10px">${rate}%</span>
            </div>
          </td>
          <td>${statusBadge}</td>
          <td style="font-size:12px;color:var(--text-secondary)">${lastFail}</td>
          <td>${qAction}</td>
        </tr>`;
      }

      html += `</tbody></table></div>`;

      // Error patterns for quarantined tests
      const quarantinedTests = sorted.filter(t => t.is_quarantined && t.last_error);
      if (quarantinedTests.length > 0) {
        html += `<h3 style="margin:24px 0 12px">Quarantined Test Errors</h3>`;
        for (const t of quarantinedTests) {
          html += `<div class="card" style="margin-bottom:8px;padding:12px">
            <div style="font-weight:600;font-size:13px">${esc(t.test_name)}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${esc(t.category)} | Quarantined ${t.quarantined_at ? new Date(t.quarantined_at).toLocaleDateString() : ''}</div>
            <pre style="font-size:11px;color:var(--danger);margin-top:8px;white-space:pre-wrap">${esc((t.last_error || '').substring(0, 500))}</pre>
          </div>`;
        }
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div class="card" style="border-color:var(--danger)"><p style="color:var(--danger)">Error: ${esc(err.message)}</p></div>`;
    }
  },

  async toggleQuarantine(flakyId, action) {
    try {
      await API.post(`/api/flaky/${flakyId}/quarantine`, { action });
      // Reload
      const targetId = document.getElementById('flakyTargetSelect').value;
      await this.load(targetId);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
