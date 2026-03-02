// AI Intent Planner — generates structured test plans from natural language intent
const IntentPlanner = {
  init() {
    document.getElementById('generatePlanBtn')?.addEventListener('click', () => this.generatePlan());
  },

  async loadTargetSelect() {
    const targets = await API.get('/api/targets');
    const select = document.getElementById('intentTargetSelect');
    select.innerHTML = targets.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    if (targets.length > 0) {
      await this.loadScanSelect(targets[0].id);
      select.addEventListener('change', () => this.loadScanSelect(select.value));
      await this.loadPlanHistory(targets[0].id);
    }
  },

  async loadScanSelect(targetId) {
    const scans = await API.get(`/api/targets/${targetId}/scans`);
    const select = document.getElementById('intentScanSelect');
    select.innerHTML = '<option value="">No scan (AI will use generic patterns)</option>' +
      scans.filter(s => s.status === 'done').map(s => {
        const stats = JSON.parse(s.stats || '{}');
        return `<option value="${s.id}">Scan #${s.id} — ${stats.pages || 0} pages, ${stats.apis || 0} APIs</option>`;
      }).join('');
  },

  async loadPlanHistory(targetId) {
    const container = document.getElementById('planHistory');
    try {
      const plans = await API.get(`/api/targets/${targetId}/plans`);
      if (plans.length === 0) {
        container.innerHTML = '';
        return;
      }

      let html = '<h3 style="margin:24px 0 12px">Previous Plans</h3>';
      html += '<div class="card-grid">';
      for (const p of plans) {
        const objectives = JSON.parse(p.objectives || '[]');
        const coverage = JSON.parse(p.coverage_map || '{}');
        html += `
          <div class="card">
            <div class="card-title">Plan #${p.id}</div>
            <div class="card-url">${esc(p.intent.substring(0, 100))}${p.intent.length > 100 ? '...' : ''}</div>
            <div class="card-meta">
              ${objectives.length} objectives |
              ${p.status} |
              ${new Date(p.created_at).toLocaleDateString()}
            </div>
            <div class="card-actions">
              <button class="btn btn-sm" onclick="IntentPlanner.viewPlan(${p.id})">View</button>
              <button class="btn btn-sm btn-primary" onclick="IntentPlanner.executePlan(${p.id})">Execute</button>
            </div>
          </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
    } catch {
      container.innerHTML = '';
    }
  },

  async generatePlan() {
    const targetId = document.getElementById('intentTargetSelect').value;
    const scanId = document.getElementById('intentScanSelect').value;
    const intent = document.getElementById('intentInput').value.trim();

    if (!intent) return alert('Please enter a test intent');
    if (!targetId) return alert('Please select a target');

    const btn = document.getElementById('generatePlanBtn');
    const container = document.getElementById('planResults');
    btn.disabled = true;
    btn.textContent = 'Generating plan...';
    container.style.display = 'block';
    container.innerHTML = `
      <div class="live-panel">
        <div class="live-panel-header">
          <div class="pulse-dot"></div>
          <h3>AI is analyzing your intent and generating a comprehensive test plan...</h3>
        </div>
        <div class="activity-list">
          <div class="activity-item"><div class="spinner"></div><span class="activity-label">Analyzing intent and discovered pages</span></div>
          <div class="activity-item"><div class="spinner"></div><span class="activity-label">Generating objectives and risk map</span></div>
          <div class="activity-item"><div class="spinner"></div><span class="activity-label">Creating test cases (happy/negative/edge/security/a11y)</span></div>
        </div>
      </div>`;

    try {
      const plan = await API.post(`/api/targets/${targetId}/plans`, {
        intent,
        scan_id: scanId || undefined,
      });
      container.innerHTML = this.renderPlan(plan);
      await this.loadPlanHistory(targetId);
    } catch (err) {
      container.innerHTML = `<div class="card" style="border-color:var(--danger)"><p style="color:var(--danger)">Error: ${esc(err.message)}</p></div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Test Plan';
    }
  },

  renderPlan(plan) {
    const objectives = plan.objectives || [];
    const stories = plan.user_stories || [];
    const riskMap = plan.risk_map || {};
    const matrix = plan.test_matrix || {};
    const criteria = plan.acceptance_criteria || [];
    const cases = plan.test_cases || [];
    const coverageMap = plan.coverage_map || {};

    let html = `
      <div class="live-panel" style="margin-top:20px">
        <div class="live-panel-header">
          <h3>Test Plan #${plan.planId}</h3>
          <button class="btn btn-sm btn-primary" onclick="IntentPlanner.executePlan(${plan.planId})">Execute Plan</button>
        </div>

        <!-- Objectives -->
        <h4 style="margin:16px 0 8px">Objectives (${objectives.length})</h4>
        <div class="cat-progress-grid">
          ${objectives.map(o => `
            <div class="cat-progress">
              <div class="cat-progress-header">
                <span class="cat-progress-label">${esc(o.id)}</span>
                <span class="badge ${o.risk_level === 'high' ? 'badge-danger' : o.risk_level === 'medium' ? 'badge-warning' : 'badge-success'}" style="font-size:10px">${o.risk_level}</span>
              </div>
              <p style="font-size:13px;margin:4px 0 0;color:var(--text)">${esc(o.title)}</p>
            </div>
          `).join('')}
        </div>

        <!-- Risk Map -->
        <h4 style="margin:16px 0 8px">Risk Map</h4>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          ${(riskMap.high || []).map(r => `<span class="badge badge-danger">${esc(r)}</span>`).join('')}
          ${(riskMap.medium || []).map(r => `<span class="badge badge-warning">${esc(r)}</span>`).join('')}
          ${(riskMap.low || []).map(r => `<span class="badge badge-success">${esc(r)}</span>`).join('')}
        </div>

        <!-- Test Matrix -->
        <h4 style="margin:16px 0 8px">Test Matrix</h4>
        <div style="display:flex;gap:16px;font-size:13px;margin-bottom:16px;color:var(--text-secondary)">
          <span>Roles: ${(matrix.roles || []).join(', ')}</span>
          <span>Browsers: ${(matrix.browsers || []).join(', ')}</span>
          <span>Viewports: ${(matrix.viewports || []).join(', ')}</span>
        </div>

        <!-- Test Cases -->
        <h4 style="margin:16px 0 8px">Test Cases (${cases.length})</h4>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Type</th><th>Priority</th><th>Category</th><th>Role</th><th>Steps</th></tr></thead>
          <tbody>
            ${cases.map(tc => {
              const priBadge = tc.priority === 'critical' ? 'badge-danger' : tc.priority === 'high' ? 'badge-warning' : tc.priority === 'medium' ? 'badge-info' : 'badge-muted';
              const typeBadge = tc.test_type === 'happy_path' ? 'badge-success' : tc.test_type === 'negative' ? 'badge-danger' : tc.test_type === 'edge_case' ? 'badge-warning' : 'badge-info';
              return `<tr>
                <td style="max-width:250px">${esc(tc.name)}</td>
                <td><span class="badge ${typeBadge}" style="font-size:10px">${tc.test_type}</span></td>
                <td><span class="badge ${priBadge}" style="font-size:10px">${tc.priority}</span></td>
                <td>${esc(tc.category)}</td>
                <td>${esc(tc.role)}</td>
                <td>${(tc.steps || []).length}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>

        <!-- Coverage Map -->
        ${Object.keys(coverageMap).length > 0 ? `
          <h4 style="margin:16px 0 8px">Coverage Distribution</h4>
          <div class="cat-progress-grid">
            ${Object.entries(coverageMap).map(([objId, cov]) => `
              <div class="cat-progress">
                <span class="cat-progress-label">${esc(objId)}</span>
                <div style="font-size:12px;margin-top:4px;color:var(--text-secondary)">
                  Happy: ${cov.happy_paths || 0} | Negative: ${cov.negative_paths || 0} | Edge: ${cov.edge_cases || 0} | Security: ${cov.security || 0}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Acceptance Criteria -->
        ${criteria.length > 0 ? `
          <h4 style="margin:16px 0 8px">Acceptance Criteria</h4>
          <ul style="font-size:13px;padding-left:20px;color:var(--text-secondary)">
            ${criteria.map(ac => `<li>${esc(ac.criterion)} <em>(${esc(ac.verification)})</em></li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;
    return html;
  },

  async viewPlan(planId) {
    const overlay = document.getElementById('drilldownOverlay');
    const title = document.getElementById('drilldownTitle');
    const content = document.getElementById('drilldownContent');

    title.textContent = `Plan #${planId}`;
    content.innerHTML = '<p>Loading...</p>';
    overlay.classList.add('open');

    try {
      const plan = await API.get(`/api/plans/${planId}`);
      content.innerHTML = this.renderPlan({ ...plan, planId });
    } catch (err) {
      content.innerHTML = `<p style="color:var(--danger)">Error: ${esc(err.message)}</p>`;
    }
  },

  async executePlan(planId) {
    if (!confirm(`Execute plan #${planId}? This will generate and run Playwright tests.`)) return;

    try {
      const result = await API.post(`/api/plans/${planId}/execute`, {});
      alert(`Test run #${result.run_id} started. Switch to History to track progress.`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
