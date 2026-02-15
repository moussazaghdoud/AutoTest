// History trends + run comparison
const History = {
  trendChart: null,
  categoryChart: null,

  init() {
    document.getElementById('historyTargetSelect').addEventListener('change', () => this.loadTrends());
  },

  async loadTargetSelect() {
    const targets = await API.get('/api/targets');
    const sel = document.getElementById('historyTargetSelect');
    sel.innerHTML = targets.length
      ? targets.map(t => `<option value="${t.id}">${Components.escHtml(t.name)}</option>`).join('')
      : '<option value="">No targets configured</option>';
    if (targets.length) this.loadTrends();
  },

  async loadTrends() {
    const targetId = document.getElementById('historyTargetSelect').value;
    if (!targetId) return;

    const trends = await API.get(`/api/targets/${targetId}/trends`);

    if (!trends.length) {
      document.getElementById('runHistoryTable').innerHTML =
        Components.emptyState('No test history', 'Run some tests to see trends');
      this.clearCharts();
      return;
    }

    this.renderTrendChart(trends);
    this.renderCategoryChart(targetId, trends);
    this.renderRunTable(trends);
  },

  clearCharts() {
    if (this.trendChart) { this.trendChart.destroy(); this.trendChart = null; }
    if (this.categoryChart) { this.categoryChart.destroy(); this.categoryChart = null; }
  },

  renderTrendChart(trends) {
    if (this.trendChart) this.trendChart.destroy();
    const ctx = document.getElementById('trendChart').getContext('2d');
    this.trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trends.map(t => new Date(t.date).toLocaleDateString()),
        datasets: [
          {
            label: 'Pass Rate %',
            data: trends.map(t => t.pass_rate),
            borderColor: '#27ae60',
            backgroundColor: 'rgba(39,174,96,0.1)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Pass Rate Over Time', color: 'hsl(248,20%,92%)' },
          legend: { labels: { color: 'hsl(248,12%,55%)' } },
        },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { callback: v => v + '%', color: 'hsl(248,12%,55%)' },
            grid: { color: 'hsl(248,15%,21%)' },
          },
          x: {
            ticks: { color: 'hsl(248,12%,55%)' },
            grid: { color: 'hsl(248,15%,21%)' },
          },
        },
      },
    });
  },

  async renderCategoryChart(targetId, trends) {
    if (this.categoryChart) this.categoryChart.destroy();

    // Get results from the latest run to show by-category breakdown
    const latestRunId = trends[trends.length - 1].run_id;
    let results = [];
    try {
      results = await API.get(`/api/runs/${latestRunId}/results`);
    } catch { /* no results */ }

    const byCategory = {};
    for (const r of results) {
      if (!byCategory[r.category]) byCategory[r.category] = { passed: 0, failed: 0 };
      if (r.status === 'passed') byCategory[r.category].passed++;
      else byCategory[r.category].failed++;
    }

    const categories = Object.keys(byCategory);
    if (!categories.length) return;

    const ctx = document.getElementById('categoryChart').getContext('2d');
    this.categoryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          {
            label: 'Passed',
            data: categories.map(c => byCategory[c].passed),
            backgroundColor: '#27ae60',
          },
          {
            label: 'Failed',
            data: categories.map(c => byCategory[c].failed),
            backgroundColor: '#e74c3c',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Results by Category (Latest Run)', color: 'hsl(248,20%,92%)' },
          legend: { labels: { color: 'hsl(248,12%,55%)' } },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: 'hsl(248,12%,55%)' },
            grid: { color: 'hsl(248,15%,21%)' },
          },
          y: {
            stacked: true, beginAtZero: true,
            ticks: { color: 'hsl(248,12%,55%)' },
            grid: { color: 'hsl(248,15%,21%)' },
          },
        },
      },
    });
  },

  renderRunTable(trends) {
    document.getElementById('runHistoryTable').innerHTML = Components.table([
      { label: 'Run', key: 'run_id', render: r => `#${r.run_id}` },
      { label: 'Date', key: 'date', render: r => new Date(r.date).toLocaleString() },
      { label: 'AI Prompt', key: 'ai_prompt', render: r => r.ai_prompt
        ? `<span title="${Components.escHtml(r.ai_prompt)}" style="cursor:help;max-width:180px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Components.escHtml(r.ai_prompt)}</span>`
        : '<span style="color:var(--text-secondary)">—</span>' },
      { label: 'Total', key: 'total' },
      { label: 'Passed', key: 'passed', render: r => `<span style="color:hsl(145,55%,55%);font-weight:600">${r.passed}</span>` },
      { label: 'Failed', key: 'failed', render: r => `<span style="color:hsl(0,65%,65%);font-weight:600">${r.failed}</span>` },
      { label: 'Pass Rate', key: 'pass_rate', render: r => Components.badge(r.pass_rate + '%', r.pass_rate >= 80 ? 'success' : r.pass_rate >= 50 ? 'warning' : 'danger') },
      { label: 'Report', key: 'run_id', render: r => `<a href="/api/runs/${r.run_id}/report" class="btn btn-sm" target="_blank">Export</a>` },
    ], trends.reverse());
  },
};
