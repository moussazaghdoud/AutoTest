// Coverage view — shows intent → objectives → tests coverage mapping
const CoverageView = {
  init() {},

  async loadTargetSelect() {
    const targets = await API.get('/api/targets');
    const select = document.getElementById('coverageTargetSelect');
    select.innerHTML = targets.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    if (targets.length > 0) {
      this.load(targets[0].id);
      select.addEventListener('change', () => this.load(select.value));
    }
  },

  async load(targetId) {
    const container = document.getElementById('coverageContent');

    try {
      const plans = await API.get(`/api/targets/${targetId}/plans`);
      if (plans.length === 0) {
        container.innerHTML = `<div class="empty-state">
          <h3>No test plans yet</h3>
          <p>Use the AI Planner to generate a test plan, then execute it to track coverage.</p>
        </div>`;
        return;
      }

      let html = '';

      for (const plan of plans) {
        const objectives = JSON.parse(plan.objectives || '[]');
        const coverageMap = JSON.parse(plan.coverage_map || '{}');

        // Fetch coverage data
        let coverage = {};
        try {
          const cov = await API.get(`/api/plans/${plan.id}/coverage`);
          coverage = cov.coverage || {};
        } catch { /* no coverage data yet */ }

        // Calculate overall coverage
        let totalCases = 0, totalCovered = 0, totalFailed = 0, totalPending = 0;
        for (const c of Object.values(coverage)) {
          totalCases += c.total;
          totalCovered += c.covered;
          totalFailed += c.failed;
          totalPending += c.pending;
        }
        const overallRate = totalCases > 0 ? Math.round((totalCovered / totalCases) * 100) : 0;
        const rateColor = overallRate >= 80 ? 'var(--success)' : overallRate >= 50 ? 'var(--warning)' : 'var(--danger)';

        html += `
          <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
              <div>
                <div class="card-title">Plan #${plan.id}: ${esc(plan.intent.substring(0, 80))}</div>
                <div class="card-meta">${objectives.length} objectives | Created ${new Date(plan.created_at).toLocaleDateString()}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:32px;font-weight:700;color:${rateColor}">${overallRate}%</div>
                <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase">Coverage</div>
              </div>
            </div>

            <!-- Overall progress bar -->
            <div class="live-progress" style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px">
                <span>${totalCovered} passed / ${totalCases} total</span>
                <span>${totalFailed} failed, ${totalPending} pending</span>
              </div>
              <div class="live-progress-bar">
                <div class="live-progress-fill" style="width:${overallRate}%;background:${rateColor}"></div>
              </div>
            </div>

            <!-- Per-objective breakdown -->
            <div class="cat-progress-grid">
              ${objectives.map(obj => {
                const cov = coverage[obj.id] || { total: 0, covered: 0, failed: 0, pending: 0, rate: 0 };
                const objRateColor = cov.rate >= 80 ? 'var(--success)' : cov.rate >= 50 ? 'var(--warning)' : cov.rate > 0 ? 'var(--danger)' : 'var(--text-secondary)';
                const riskBadge = obj.risk_level === 'high' ? 'badge-danger' : obj.risk_level === 'medium' ? 'badge-warning' : 'badge-success';

                return `
                  <div class="cat-progress">
                    <div class="cat-progress-header">
                      <span class="cat-progress-label">${esc(obj.id)}</span>
                      <span class="badge ${riskBadge}" style="font-size:9px">${obj.risk_level}</span>
                    </div>
                    <p style="font-size:12px;margin:4px 0;color:var(--text)">${esc(obj.title)}</p>
                    <div class="cat-progress-bar" style="margin-top:6px">
                      <div class="cat-progress-fill ${cov.rate >= 80 ? 'all-pass' : cov.failed > 0 ? 'has-fail' : 'mixed'}"
                           style="width:${cov.rate}%"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;color:var(--text-secondary)">
                      <span>${cov.covered}/${cov.total} covered</span>
                      <span style="color:${objRateColor};font-weight:600">${cov.rate}%</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<div class="card" style="border-color:var(--danger)"><p style="color:var(--danger)">Error: ${esc(err.message)}</p></div>`;
    }
  },
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
