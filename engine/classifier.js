// Dedup + tag (auth-required, login form, etc.)

function classifyPages(pages) {
  const seen = new Set();
  return pages.filter(p => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}

function classifyApis(apis) {
  const seen = new Set();
  return apis.filter(a => {
    const key = `${a.method}:${a.url}`;
    if (seen.has(key)) return false;
    seen.add(key);

    // Tag auth-required based on 401/403
    if (a.response_status === 401 || a.response_status === 403) {
      a.requires_auth = 1;
    }

    return true;
  });
}

function classifyForms(forms) {
  const seen = new Set();
  return forms.filter(f => {
    const key = `${f.page_url}:${f.action}:${f.method}`;
    if (seen.has(key)) return false;
    seen.add(key);

    // Detect login forms
    try {
      const fields = JSON.parse(f.fields);
      const hasPassword = fields.some(fi => fi.type === 'password');
      const hasUsername = fields.some(fi =>
        fi.type === 'email' || /user|email|login/i.test(fi.name)
      );
      f.is_login_form = (hasPassword && hasUsername) ? 1 : 0;
    } catch {
      f.is_login_form = 0;
    }

    return true;
  });
}

module.exports = { classifyPages, classifyApis, classifyForms };
