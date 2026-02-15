// Fetch wrapper for server API
const API = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `POST ${path} failed`);
    }
    return res.json();
  },

  async put(path, body) {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
    return res.json();
  },

  async del(path) {
    const res = await fetch(path, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
    return res.json();
  },

  sse(type, id, handlers) {
    const es = new EventSource(`/api/events/${type}/${id}`);
    for (const [event, fn] of Object.entries(handlers)) {
      es.addEventListener(event, (e) => fn(JSON.parse(e.data)));
    }
    es.onerror = () => {
      es.close();
      if (handlers.error) handlers.error({ message: 'Connection lost' });
    };
    return es;
  },
};
