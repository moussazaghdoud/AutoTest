// Target edit form logic
const Config = {
  init() {
    document.getElementById('addTargetBtn').addEventListener('click', () => this.openModal());
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
    document.getElementById('modalCancel').addEventListener('click', () => this.closeModal());
    document.getElementById('targetForm').addEventListener('submit', (e) => this.saveTarget(e));
    document.getElementById('targetAuthType').addEventListener('change', (e) => this.renderAuthFields(e.target.value));
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  },

  openModal(target) {
    const overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTitle').textContent = target ? 'Edit Target' : 'Add Target';
    document.getElementById('targetId').value = target ? target.id : '';
    document.getElementById('targetName').value = target ? target.name : '';
    document.getElementById('targetUrl').value = target ? target.base_url : '';
    document.getElementById('targetAuthType').value = target ? target.auth_type : 'none';
    this.currentAuthConfig = target ? JSON.parse(target.auth_config || '{}') : {};
    this.renderAuthFields(target ? target.auth_type : 'none');
    overlay.classList.add('open');
  },

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('targetForm').reset();
  },

  renderAuthFields(type) {
    const container = document.getElementById('authConfigFields');
    const cfg = this.currentAuthConfig || {};

    const fields = {
      none: '',
      form: `
        <div class="form-group">
          <label>Login URL</label>
          <input type="text" name="login_url" value="${Components.escHtml(cfg.login_url || '')}" placeholder="/login">
        </div>
        <div class="form-group" style="position:relative">
          <label>Username Field Selector</label>
          <input type="text" name="username_selector" id="autodetectUsername" value="${Components.escHtml(cfg.username_selector || '')}" placeholder="Auto-detected">
        </div>
        <div class="form-group">
          <label>Password Field Selector</label>
          <input type="text" name="password_selector" id="autodetectPassword" value="${Components.escHtml(cfg.password_selector || '')}" placeholder="Auto-detected">
        </div>
        <div class="form-group">
          <label>Submit Selector</label>
          <input type="text" name="submit_selector" id="autodetectSubmit" value="${Components.escHtml(cfg.submit_selector || '')}" placeholder="Auto-detected">
        </div>
        <button type="button" class="btn" id="autodetectBtn" style="margin-bottom:12px;font-size:13px" onclick="Config.autoDetectLogin()">Auto-detect selectors</button>
        <div id="autodetectStatus" style="font-size:12px;color:var(--text-secondary);margin-bottom:8px"></div>
        <div class="form-group"><label>Username</label><input type="text" name="username" value="${Components.escHtml(cfg.username || '')}"></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" value="${Components.escHtml(cfg.password || '')}"></div>`,
      basic: `
        <div class="form-group"><label>Username</label><input type="text" name="username" value="${Components.escHtml(cfg.username || '')}"></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" value="${Components.escHtml(cfg.password || '')}"></div>`,
      bearer: `
        <div class="form-group"><label>Token</label><input type="text" name="token" value="${Components.escHtml(cfg.token || '')}" placeholder="Static JWT or API key"></div>
        <div class="form-group"><label>Or: Login API URL</label><input type="text" name="login_api" value="${Components.escHtml(cfg.login_api || '')}" placeholder="/api/auth/login"></div>
        <div class="form-group"><label>Username</label><input type="text" name="username" value="${Components.escHtml(cfg.username || '')}"></div>
        <div class="form-group"><label>Password</label><input type="password" name="password" value="${Components.escHtml(cfg.password || '')}"></div>
        <div class="form-group"><label>Token JSON Path</label><input type="text" name="token_path" value="${Components.escHtml(cfg.token_path || '')}" placeholder="token or data.accessToken"></div>`,
      cookie: `
        <div class="form-group"><label>Cookie Name</label><input type="text" name="cookie_name" value="${Components.escHtml(cfg.cookie_name || '')}"></div>
        <div class="form-group"><label>Cookie Value</label><input type="text" name="cookie_value" value="${Components.escHtml(cfg.cookie_value || '')}"></div>`,
    };

    container.innerHTML = fields[type] || '';
  },

  async autoDetectLogin() {
    const baseUrl = document.getElementById('targetUrl').value.trim();
    const loginPath = document.querySelector('input[name="login_url"]')?.value.trim() || '/login';
    if (!baseUrl) return alert('Enter the Base URL first');

    const btn = document.getElementById('autodetectBtn');
    const status = document.getElementById('autodetectStatus');
    btn.disabled = true;
    btn.textContent = 'Detecting...';
    status.textContent = 'Visiting login page and scanning form fields...';

    try {
      const url = baseUrl.replace(/\/$/, '') + (loginPath.startsWith('/') ? loginPath : '/' + loginPath);
      const result = await API.post('/api/detect-login', { url });

      if (result.username_selector) {
        document.getElementById('autodetectUsername').value = result.username_selector;
      }
      if (result.password_selector) {
        document.getElementById('autodetectPassword').value = result.password_selector;
      }
      if (result.submit_selector) {
        document.getElementById('autodetectSubmit').value = result.submit_selector;
      }

      const found = [
        result.username_selector ? 'username' : null,
        result.password_selector ? 'password' : null,
        result.submit_selector ? 'submit' : null,
      ].filter(Boolean);

      status.textContent = found.length > 0
        ? `Detected: ${found.join(', ')} fields`
        : 'Could not detect form fields — enter selectors manually';
      status.style.color = found.length > 0 ? 'hsl(145,55%,55%)' : 'hsl(40,75%,65%)';
    } catch (err) {
      status.textContent = 'Detection failed: ' + err.message;
      status.style.color = 'hsl(0,65%,65%)';
    }

    btn.disabled = false;
    btn.textContent = 'Auto-detect selectors';
  },

  async saveTarget(e) {
    e.preventDefault();
    const id = document.getElementById('targetId').value;
    const name = document.getElementById('targetName').value.trim();
    const base_url = document.getElementById('targetUrl').value.trim();
    const auth_type = document.getElementById('targetAuthType').value;

    // Collect auth config from dynamic fields
    const auth_config = {};
    const inputs = document.getElementById('authConfigFields').querySelectorAll('input');
    for (const inp of inputs) {
      if (inp.name && inp.value.trim()) auth_config[inp.name] = inp.value.trim();
    }

    const body = { name, base_url, auth_type, auth_config };

    try {
      if (id) {
        await API.put(`/api/targets/${id}`, body);
      } else {
        await API.post('/api/targets', body);
      }
      this.closeModal();
      App.loadTargets();
    } catch (err) {
      alert('Error saving target: ' + err.message);
    }
  },

  async editTarget(id) {
    const target = await API.get(`/api/targets/${id}`);
    this.openModal(target);
  },

  async deleteTarget(id) {
    if (!confirm('Delete this target and all its data?')) return;
    await API.del(`/api/targets/${id}`);
    App.loadTargets();
  },
};
