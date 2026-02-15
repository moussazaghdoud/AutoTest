// Discovery scan UI + results tabs
const Discovery = {
  currentScanId: null,
  sseConnection: null,

  init() {
    document.getElementById('startScanBtn').addEventListener('click', () => this.startScan());
    // Tab switching
    document.querySelectorAll('.tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  },

  async loadTargetSelect() {
    const targets = await API.get('/api/targets');
    const sel = document.getElementById('discoveryTargetSelect');
    sel.innerHTML = targets.length
      ? targets.map(t => `<option value="${t.id}">${Components.escHtml(t.name)}</option>`).join('')
      : '<option value="">No targets configured</option>';
  },

  scanTarget(targetId) {
    // Switch to discovery view and select the target
    App.switchView('discovery');
    const sel = document.getElementById('discoveryTargetSelect');
    sel.value = targetId;
    this.startScan();
  },

  async startScan() {
    const targetId = document.getElementById('discoveryTargetSelect').value;
    if (!targetId) return alert('Select a target first');

    document.getElementById('scanProgress').style.display = 'block';
    document.getElementById('scanResults').style.display = 'none';
    document.getElementById('scanProgressFill').style.width = '5%';
    document.getElementById('scanProgressText').textContent = 'Starting scan...';
    document.getElementById('startScanBtn').disabled = true;

    try {
      const { scan_id } = await API.post(`/api/targets/${targetId}/scan`);
      this.currentScanId = scan_id;
      this.listenToScan(scan_id);
    } catch (err) {
      alert('Failed to start scan: ' + err.message);
      document.getElementById('startScanBtn').disabled = false;
    }
  },

  listenToScan(scanId) {
    if (this.sseConnection) this.sseConnection.close();

    this.sseConnection = API.sse('scan', scanId, {
      progress: (data) => {
        const pct = data.percent || 0;
        document.getElementById('scanProgressFill').style.width = pct + '%';
        document.getElementById('scanProgressText').textContent = data.message || `Scanning... ${pct}%`;
      },
      page: () => {},
      api: () => {},
      form: () => {},
      done: (data) => {
        document.getElementById('scanProgressFill').style.width = '100%';
        document.getElementById('scanProgressText').textContent = `Scan complete! ${data.pages || 0} pages, ${data.apis || 0} APIs, ${data.forms || 0} forms`;
        document.getElementById('startScanBtn').disabled = false;
        this.sseConnection.close();
        this.loadResults(scanId);
      },
      error: (data) => {
        document.getElementById('scanProgressText').textContent = 'Scan error: ' + (data.message || 'unknown');
        document.getElementById('startScanBtn').disabled = false;
        if (this.sseConnection) this.sseConnection.close();
      },
    });
  },

  async loadResults(scanId) {
    document.getElementById('scanResults').style.display = 'block';

    const [pages, apis, forms] = await Promise.all([
      API.get(`/api/scans/${scanId}/pages`),
      API.get(`/api/scans/${scanId}/apis`),
      API.get(`/api/scans/${scanId}/forms`),
    ]);

    // Pages table
    document.getElementById('tab-pages').innerHTML = pages.length
      ? Components.table([
          { label: 'URL', key: 'url', render: r => `<a href="${Components.escHtml(r.url)}" target="_blank">${Components.escHtml(r.url)}</a>` },
          { label: 'Title', key: 'title' },
          { label: 'Status', key: 'status_code', render: r => Components.statusBadge(r.status_code) },
          { label: 'Time', key: 'response_time', render: r => (r.response_time || '-') + 'ms' },
          { label: 'Forms', key: 'has_forms', render: r => r.has_forms ? 'Yes' : '' },
          { label: 'Auth', key: 'is_auth_page', render: r => r.is_auth_page ? Components.badge('auth', 'warning') : '' },
        ], pages)
      : Components.emptyState('No pages found', 'Run a scan to discover pages');

    // APIs table
    document.getElementById('tab-apis').innerHTML = apis.length
      ? Components.table([
          { label: 'Method', key: 'method', render: r => Components.badge(r.method, 'info') },
          { label: 'URL', key: 'url' },
          { label: 'Status', key: 'response_status', render: r => Components.statusBadge(r.response_status) },
          { label: 'Type', key: 'response_type' },
          { label: 'Auth', key: 'requires_auth', render: r => r.requires_auth ? Components.badge('auth', 'warning') : '' },
        ], apis)
      : Components.emptyState('No APIs found', 'Run a scan to discover API endpoints');

    // Forms table
    document.getElementById('tab-forms').innerHTML = forms.length
      ? Components.table([
          { label: 'Page', key: 'page_url' },
          { label: 'Action', key: 'action' },
          { label: 'Method', key: 'method', render: r => Components.badge(r.method, 'info') },
          { label: 'Fields', key: 'fields', render: r => { try { return JSON.parse(r.fields).length + ' fields'; } catch { return '-'; } } },
          { label: 'Login', key: 'is_login_form', render: r => r.is_login_form ? Components.badge('login', 'warning') : '' },
        ], forms)
      : Components.emptyState('No forms found', 'Run a scan to discover forms');
  },
};
