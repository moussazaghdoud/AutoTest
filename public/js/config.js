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
        <div class="form-group"><label>Login URL</label><input type="text" name="login_url" value="${Components.escHtml(cfg.login_url || '')}" placeholder="/login"></div>
        <div class="form-group"><label>Username Field Selector</label><input type="text" name="username_selector" value="${Components.escHtml(cfg.username_selector || '')}" placeholder='input[name="email"]'></div>
        <div class="form-group"><label>Password Field Selector</label><input type="text" name="password_selector" value="${Components.escHtml(cfg.password_selector || '')}" placeholder='input[name="password"]'></div>
        <div class="form-group"><label>Submit Selector</label><input type="text" name="submit_selector" value="${Components.escHtml(cfg.submit_selector || '')}" placeholder='button[type="submit"]'></div>
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
