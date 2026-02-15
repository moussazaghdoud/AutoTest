// Extracts forms + fields from DOM

async function detectForms(page, pageUrl) {
  try {
    const forms = await page.$$eval('form', (formEls, pUrl) => {
      return formEls.map(form => {
        const fields = [];
        const inputs = form.querySelectorAll('input, select, textarea');
        for (const inp of inputs) {
          if (inp.type === 'hidden' && !inp.name) continue;
          fields.push({
            tag: inp.tagName.toLowerCase(),
            type: inp.type || 'text',
            name: inp.name || '',
            id: inp.id || '',
            required: inp.required || false,
            placeholder: inp.placeholder || '',
          });
        }

        return {
          page_url: pUrl,
          action: form.action || pUrl,
          method: (form.method || 'GET').toUpperCase(),
          fields: JSON.stringify(fields),
        };
      });
    }, pageUrl);

    return forms;
  } catch {
    return [];
  }
}

module.exports = { detectForms };
