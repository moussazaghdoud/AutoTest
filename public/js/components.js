// Reusable UI components

const Components = {
  escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  badge(text, type) {
    return `<span class="badge badge-${type}">${this.escHtml(text)}</span>`;
  },

  statusBadge(code) {
    if (code >= 200 && code < 300) return this.badge(code, 'success');
    if (code >= 300 && code < 400) return this.badge(code, 'info');
    if (code >= 400 && code < 500) return this.badge(code, 'warning');
    return this.badge(code, 'danger');
  },

  resultBadge(status) {
    const map = { passed: 'success', failed: 'danger', skipped: 'warning' };
    return this.badge(status, map[status] || 'muted');
  },

  table(columns, rows) {
    const ths = columns.map(c => `<th>${this.escHtml(c.label)}</th>`).join('');
    const trs = rows.map(row => {
      const tds = columns.map(c => `<td>${c.render ? c.render(row) : this.escHtml(row[c.key])}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  },

  emptyState(title, subtitle) {
    return `<div class="empty-state"><h3>${this.escHtml(title)}</h3><p>${this.escHtml(subtitle)}</p></div>`;
  },

  statCards(stats) {
    return `<div class="results-summary">${stats.map(s =>
      `<div class="stat-card"><div class="num" style="color:${s.color || 'var(--text)'}">${s.value}</div><div class="label">${s.label}</div></div>`
    ).join('')}</div>`;
  },

  targetCard(t) {
    const authBadge = t.auth_type !== 'none' ? this.badge(t.auth_type, 'info') : '';
    return `
      <div class="card" data-id="${t.id}">
        <div class="card-title">${this.escHtml(t.name)}</div>
        <div class="card-url">${this.escHtml(t.base_url)}</div>
        <div class="card-meta">${authBadge} Added ${new Date(t.created_at).toLocaleDateString()}</div>
        <div class="card-actions">
          <button class="btn btn-sm btn-primary" onclick="Discovery.scanTarget(${t.id})">Scan</button>
          <button class="btn btn-sm" onclick="Config.editTarget(${t.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="Config.deleteTarget(${t.id})">Delete</button>
        </div>
      </div>`;
  },
};
