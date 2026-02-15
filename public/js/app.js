// SPA router, view switching, init
const App = {
  init() {
    Config.init();
    Discovery.init();
    Runner.init();
    History.init();

    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchView(link.dataset.view);
        history.pushState(null, '', `#${link.dataset.view}`);
      });
    });

    // Handle initial hash
    const hash = location.hash.replace('#', '') || 'targets';
    this.switchView(hash);

    // Load initial data
    this.loadTargets();
  },

  switchView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const view = document.getElementById(`view-${name}`);
    const link = document.querySelector(`.nav-link[data-view="${name}"]`);
    if (view) view.classList.add('active');
    if (link) link.classList.add('active');

    // Load view-specific data
    if (name === 'discovery') Discovery.loadTargetSelect();
    if (name === 'runner') Runner.loadTargetSelect();
    if (name === 'history') History.loadTargetSelect();
  },

  async loadTargets() {
    const targets = await API.get('/api/targets');
    const container = document.getElementById('targetsList');
    if (targets.length === 0) {
      container.innerHTML = Components.emptyState(
        'No targets yet',
        'Add a web application to start testing'
      );
    } else {
      container.innerHTML = targets.map(t => Components.targetCard(t)).join('');
    }
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
