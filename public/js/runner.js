// Test runner UI — type selection, config, live results with streaming
const Runner = {
  sseConnection: null,

  // Live state
  totalTests: 0,
  completedTests: 0,
  categoryProgress: {},
  testResults: [],
  selectedTestTypes: [],
  timerInterval: null,
  startTime: null,
  firstResultReceived: false,

  init() {
    document.getElementById('startRunBtn').addEventListener('click', () => this.startRun());
    document.getElementById('concurrencySlider').addEventListener('input', (e) => {
      document.getElementById('concurrencyValue').textContent = e.target.value;
    });
    document.getElementById('runnerTargetSelect').addEventListener('change', () => this.loadScansForTarget());
  },

  async loadTargetSelect() {
    const targets = await API.get('/api/targets');
    const sel = document.getElementById('runnerTargetSelect');
    sel.innerHTML = targets.length
      ? targets.map(t => `<option value="${t.id}">${Components.escHtml(t.name)}</option>`).join('')
      : '<option value="">No targets configured</option>';
    if (targets.length) this.loadScansForTarget();
  },

  async loadScansForTarget() {
    const targetId = document.getElementById('runnerTargetSelect').value;
    if (!targetId) return;
    try {
      const scans = await API.get(`/api/targets/${targetId}/scans`);
      const sel = document.getElementById('runnerScanSelect');
      sel.innerHTML = scans.length
        ? scans.map(s => `<option value="${s.id}">Scan #${s.id} (${s.status}) — ${new Date(s.created_at).toLocaleString()}</option>`).join('')
        : '<option value="">No scans yet — run Discovery first</option>';
    } catch {
      document.getElementById('runnerScanSelect').innerHTML = '<option value="">Run Discovery first</option>';
    }
  },

  resetLiveState() {
    this.totalTests = 0;
    this.completedTests = 0;
    this.categoryProgress = {};
    this.testResults = [];
    this.selectedTestTypes = [];
    this.firstResultReceived = false;
    this.startTime = Date.now();
    if (this.timerInterval) clearInterval(this.timerInterval);
  },

  startTimer() {
    this.startTime = Date.now();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const el = document.getElementById('liveTimer');
      if (el) el.textContent = this.formatElapsed();
    }, 1000);
  },

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  },

  formatElapsed() {
    const s = Math.floor((Date.now() - this.startTime) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  },

  async startRun() {
    const targetId = document.getElementById('runnerTargetSelect').value;
    const scanId = document.getElementById('runnerScanSelect').value;
    if (!targetId || !scanId) return alert('Select a target and scan first');

    const checkboxes = document.querySelectorAll('#testTypeCheckboxes input:checked');
    const test_types = Array.from(checkboxes).map(cb => cb.value);
    if (test_types.length === 0) return alert('Select at least one test type');

    const concurrency = parseInt(document.getElementById('concurrencySlider').value);
    const ai_prompt = document.getElementById('aiPromptInput').value.trim();

    this.resetLiveState();
    this.selectedTestTypes = ai_prompt ? [...test_types, 'custom'] : test_types;
    document.getElementById('runProgress').style.display = 'block';
    document.getElementById('runResults').style.display = 'none';
    document.getElementById('startRunBtn').disabled = true;

    // Show initial generating state
    this.startTimer();
    this.renderLivePanel('generating');

    try {
      const body = { scan_id: scanId, test_types, concurrency };
      if (ai_prompt) body.ai_prompt = ai_prompt;
      const { run_id } = await API.post(`/api/targets/${targetId}/run`, body);
      this.listenToRun(run_id);
    } catch (err) {
      alert('Failed to start run: ' + err.message);
      document.getElementById('startRunBtn').disabled = false;
      document.getElementById('runProgress').style.display = 'none';
      this.stopTimer();
    }
  },

  buildActivityList(phase) {
    if (phase === 'generating') {
      // Show each selected test type as a generating task
      const items = this.selectedTestTypes.map(type => {
        if (type === 'custom') {
          return `
            <div class="activity-item">
              <div class="spinner"></div>
              <span class="activity-label">AI generating <strong>custom</strong> tests<span class="secondary">sending prompt to OpenAI</span></span>
              <span class="activity-badge generating">AI</span>
            </div>`;
        }
        return `
          <div class="activity-item">
            <div class="spinner"></div>
            <span class="activity-label">Generating <strong>${Components.escHtml(type)}</strong> tests<span class="secondary">analyzing discovered endpoints</span></span>
            <span class="activity-badge generating">generating</span>
          </div>`;
      }).join('');
      return `<div class="activity-list">${items}</div>`;
    }

    if (phase === 'executing') {
      const cats = Object.keys(this.categoryProgress);
      if (cats.length === 0) {
        // Fallback: show selected types as "waiting"
        const items = this.selectedTestTypes.map(type => `
          <div class="activity-item">
            <div class="spinner"></div>
            <span class="activity-label">Preparing <strong>${Components.escHtml(type)}</strong> tests</span>
            <span class="activity-badge waiting">waiting</span>
          </div>`).join('');
        return `<div class="activity-list">${items}</div>`;
      }

      const items = cats.map(cat => {
        const cp = this.categoryProgress[cat];
        if (cp.done >= cp.total && cp.total > 0) {
          // Completed
          const passCount = cp.passed || 0;
          const failCount = cp.failed || 0;
          return `
            <div class="activity-item">
              <div class="check-icon">\u2713</div>
              <span class="activity-label"><strong>${Components.escHtml(cat)}</strong><span class="secondary">${passCount} passed${failCount ? ', ' + failCount + ' failed' : ''}</span></span>
              <span class="activity-badge done">done</span>
            </div>`;
        } else if (cp.done > 0) {
          // In progress with some results
          return `
            <div class="activity-item">
              <div class="spinner"></div>
              <span class="activity-label"><strong>${Components.escHtml(cat)}</strong><span class="secondary">${cp.done}/${cp.total} completed</span></span>
              <span class="activity-badge running">running</span>
            </div>`;
        } else {
          // Waiting / no results yet
          return `
            <div class="activity-item">
              <div class="spinner"></div>
              <span class="activity-label"><strong>${Components.escHtml(cat)}</strong><span class="secondary">${cp.total} tests queued</span></span>
              <span class="activity-badge waiting">queued</span>
            </div>`;
        }
      }).join('');
      return `<div class="activity-list">${items}</div>`;
    }

    return '';
  },

  buildShimmerFeed() {
    // 5 shimmer placeholder rows
    let rows = '';
    for (let i = 0; i < 5; i++) {
      const w1 = 40 + Math.random() * 30; // varying widths
      const w2 = 60 + Math.random() * 80;
      rows += `
        <div class="shimmer-row" style="animation-delay:${i * 0.1}s">
          <div class="shimmer-circle"></div>
          <div class="shimmer-block" style="width:${w1}px"></div>
          <div class="shimmer-block" style="flex:1;max-width:${w2}px"></div>
          <div class="shimmer-block" style="width:40px"></div>
        </div>`;
    }
    return rows;
  },

  renderLivePanel(phase) {
    const container = document.getElementById('runProgress');
    const isRunning = phase !== 'done';
    const dotClass = isRunning ? 'pulse-dot' : 'pulse-dot done';
    const headerText = phase === 'generating' ? 'Generating Tests...' :
                       phase === 'done' ? 'Tests Complete' : 'Running Tests';

    const counterText = this.totalTests > 0
      ? `${this.completedTests}/${this.totalTests} tests`
      : '';

    // Build category progress bars (only when we have them and results have started)
    let categoryHtml = '';
    const cats = Object.keys(this.categoryProgress);
    if (cats.length > 0 && this.firstResultReceived) {
      categoryHtml = '<div class="cat-progress-grid">';
      for (const cat of cats) {
        const cp = this.categoryProgress[cat];
        const pct = cp.total > 0 ? Math.round((cp.done / cp.total) * 100) : 0;
        const fillClass = cp.failed > 0 ? 'has-fail' : (cp.done > 0 ? 'all-pass' : 'mixed');
        categoryHtml += `
          <div class="cat-progress" data-cat="${cat}">
            <div class="cat-progress-header">
              <span class="cat-progress-label">${Components.escHtml(cat)}</span>
              <span class="cat-progress-count">${cp.done}/${cp.total}</span>
            </div>
            <div class="cat-progress-bar">
              <div class="cat-progress-fill ${fillClass}" style="width:${pct}%"></div>
            </div>
          </div>`;
      }
      categoryHtml += '</div>';
    }

    // Overall progress bar
    const overallPct = this.totalTests > 0 ? Math.round((this.completedTests / this.totalTests) * 100) : 0;
    const progressBarHtml = phase === 'generating'
      ? `<div class="live-progress"><div class="live-progress-bar"><div class="cat-progress-fill indeterminate"></div></div></div>`
      : `<div class="live-progress"><div class="live-progress-bar"><div class="live-progress-fill" id="liveProgressFill" style="width:${overallPct}%"></div></div></div>`;

    // Activity list: always shown during generating, shown during executing until results flow
    const activityHtml = (phase === 'generating' || (phase === 'executing'))
      ? `<div id="activityArea">${this.buildActivityList(phase)}</div>`
      : '';

    // Feed: shown during executing with shimmer if no results yet, real results otherwise
    let feedHtml = '';
    if (phase === 'executing' || phase === 'done') {
      feedHtml = `<div class="live-feed" id="liveFeed"></div>`;
    }

    container.innerHTML = `
      <div class="live-panel">
        <div class="live-panel-header">
          <div class="${dotClass}"></div>
          <h3>${headerText}</h3>
          <span class="live-panel-timer" id="liveTimer">${this.formatElapsed()}</span>
          <span class="live-panel-counter" id="liveCounter">${counterText}</span>
        </div>
        ${progressBarHtml}
        ${categoryHtml}
        ${activityHtml}
        ${feedHtml}
      </div>`;

    // If executing with no results yet, show shimmer in feed
    if (phase === 'executing' && !this.firstResultReceived) {
      const feed = document.getElementById('liveFeed');
      if (feed) feed.innerHTML = this.buildShimmerFeed();
    }

    // Re-render existing results into feed
    if (this.firstResultReceived) {
      const feed = document.getElementById('liveFeed');
      if (feed) {
        for (const r of this.testResults) {
          feed.appendChild(this.createFeedItem(r));
        }
      }
    }
  },

  updateActivityList() {
    const area = document.getElementById('activityArea');
    if (area) {
      area.innerHTML = this.buildActivityList('executing');
    }
  },

  updateLivePanel() {
    // Update counter
    const counter = document.getElementById('liveCounter');
    if (counter) {
      counter.textContent = this.totalTests > 0
        ? `${this.completedTests}/${this.totalTests} tests`
        : '';
    }

    // Update overall progress bar
    const fill = document.getElementById('liveProgressFill');
    if (fill && this.totalTests > 0) {
      fill.style.width = Math.round((this.completedTests / this.totalTests) * 100) + '%';
    }

    // Update category bars
    for (const [cat, cp] of Object.entries(this.categoryProgress)) {
      const catEl = document.querySelector(`.cat-progress[data-cat="${cat}"]`);
      if (catEl) {
        const countEl = catEl.querySelector('.cat-progress-count');
        const fillEl = catEl.querySelector('.cat-progress-fill');
        if (countEl) countEl.textContent = `${cp.done}/${cp.total}`;
        if (fillEl) {
          fillEl.style.width = (cp.total > 0 ? Math.round((cp.done / cp.total) * 100) : 0) + '%';
          fillEl.className = 'cat-progress-fill ' + (cp.failed > 0 ? 'has-fail' : (cp.done > 0 ? 'all-pass' : 'mixed'));
        }
      }
    }

    // Update activity list with latest progress
    this.updateActivityList();
  },

  createFeedItem(result) {
    const item = document.createElement('div');
    item.className = 'feed-item';

    const icon = result.status === 'passed' ? '\u2713' : '\u2717';
    const iconClass = result.status;

    item.innerHTML = `
      <div class="feed-icon ${iconClass}">${icon}</div>
      <span class="feed-category">${Components.escHtml(result.category)}</span>
      <span class="feed-name" title="${Components.escHtml(result.name)}">${Components.escHtml(result.name)}</span>
      <span class="feed-duration">${result.duration}ms</span>`;

    return item;
  },

  addTestResultToFeed(result) {
    const feed = document.getElementById('liveFeed');
    if (!feed) return;

    // On first result, clear shimmer placeholders and re-render with category bars
    if (!this.firstResultReceived) {
      this.firstResultReceived = true;
      feed.innerHTML = '';
      this.renderLivePanel('executing');
      return; // renderLivePanel will re-add all results
    }

    const item = this.createFeedItem(result);
    // Prepend (newest on top)
    feed.insertBefore(item, feed.firstChild);

    // Cap visible items at 50
    while (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  },

  listenToRun(runId) {
    if (this.sseConnection) this.sseConnection.close();

    this.sseConnection = API.sse('run', runId, {
      status: (data) => {
        if (data.phase === 'executing') {
          this.renderLivePanel('executing');
        }
      },

      generation_done: (data) => {
        this.totalTests = data.total || 0;
        this.categoryProgress = {};
        if (data.categories) {
          for (const [cat, count] of Object.entries(data.categories)) {
            this.categoryProgress[cat] = { done: 0, total: count, passed: 0, failed: 0 };
          }
        }
        this.renderLivePanel('executing');
      },

      test_total: (data) => {
        if (data.total) this.totalTests = data.total;
        this.updateLivePanel();
      },

      test_result: (data) => {
        this.completedTests = data.completed || (this.completedTests + 1);
        if (data.categoryProgress) {
          this.categoryProgress = data.categoryProgress;
        }

        const result = {
          name: data.name,
          category: data.category,
          status: data.status,
          duration: data.duration,
        };
        this.testResults.unshift(result);
        if (this.testResults.length > 50) this.testResults.pop();

        this.updateLivePanel();
        this.addTestResultToFeed(result);
      },

      done: (data) => {
        this.stopTimer();

        // Mark panel as done
        const dot = document.querySelector('.pulse-dot');
        if (dot) dot.classList.add('done');
        const header = document.querySelector('.live-panel-header h3');
        if (header) header.textContent = 'Tests Complete';

        // Stop any indeterminate animation and fill to 100%
        const indeterminate = document.querySelector('.cat-progress-fill.indeterminate');
        if (indeterminate) {
          indeterminate.classList.remove('indeterminate');
          indeterminate.classList.add('all-pass');
          indeterminate.style.width = '100%';
        }
        const fill = document.getElementById('liveProgressFill');
        if (fill) fill.style.width = '100%';

        // Remove activity area
        const actArea = document.getElementById('activityArea');
        if (actArea) actArea.remove();

        document.getElementById('startRunBtn').disabled = false;
        if (this.sseConnection) this.sseConnection.close();
        this.loadResults(runId);
      },

      error: (data) => {
        this.stopTimer();

        // Stop indeterminate animation
        const indeterminate = document.querySelector('.cat-progress-fill.indeterminate');
        if (indeterminate) {
          indeterminate.classList.remove('indeterminate');
          indeterminate.style.width = '0%';
        }

        const dot = document.querySelector('.pulse-dot');
        if (dot) dot.classList.add('done');
        const header = document.querySelector('.live-panel-header h3');
        if (header) {
          header.textContent = 'Error: ' + (data.message || 'unknown');
          header.style.color = 'var(--danger)';
        }
        document.getElementById('startRunBtn').disabled = false;
        if (this.sseConnection) this.sseConnection.close();
      },
    });
  },

  async loadResults(runId) {
    document.getElementById('runResults').style.display = 'block';
    const [run, results] = await Promise.all([
      API.get(`/api/runs/${runId}`),
      API.get(`/api/runs/${runId}/results`),
    ]);

    const summary = JSON.parse(run.summary || '{}');

    let html = Components.statCards([
      { label: 'Total', value: summary.total || 0 },
      { label: 'Passed', value: summary.passed || 0, color: 'hsl(145, 55%, 55%)' },
      { label: 'Failed', value: summary.failed || 0, color: 'hsl(0, 65%, 65%)' },
      { label: 'Skipped', value: summary.skipped || 0, color: 'hsl(40, 75%, 65%)' },
    ]);

    html += `<div style="margin-bottom:12px"><a href="/api/runs/${runId}/report" class="btn btn-sm" target="_blank">Download Report</a></div>`;

    html += results.length
      ? Components.table([
          { label: 'Category', key: 'category', render: r => Components.badge(r.category, 'info') },
          { label: 'Test', key: 'test_name' },
          { label: 'Status', key: 'status', render: r => Components.resultBadge(r.status) },
          { label: 'Duration', key: 'duration', render: r => (r.duration || '-') + 'ms' },
          { label: 'Error', key: 'error_message', render: r => `<span style="color:var(--danger);font-size:12px">${Components.escHtml(r.error_message || '')}</span>` },
        ], results)
      : Components.emptyState('No results', 'Something went wrong');

    document.getElementById('runResults').innerHTML = html;
  },
};
