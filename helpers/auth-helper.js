const config = require('../config');

/**
 * Get an admin JWT token via the login API.
 */
async function getAdminToken(request) {
  const res = await request.post(`${config.BASE_URL}/api/admin/login`, {
    data: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD },
  });
  const body = await res.json();
  if (!res.ok()) throw new Error(`Admin login failed: ${body.error || res.status()}`);
  return body.token;
}

/**
 * Register a new test client and return { token, user, email, password }.
 */
async function createTestClient(request, overrides = {}) {
  const ts = Date.now();
  const email = overrides.email || `${config.TEST_PREFIX}_${ts}@test.com`;
  const password = overrides.password || 'TestPass123!';
  const firstName = overrides.firstName || 'Test';
  const lastName = overrides.lastName || `User${ts}`;

  const res = await request.post(`${config.BASE_URL}/api/client/register`, {
    data: { email, password, firstName, lastName },
  });
  const body = await res.json();
  if (!res.ok()) throw new Error(`Client registration failed: ${body.error || res.status()}`);
  return { token: body.token, user: body.user, email, password };
}

/**
 * Get a client JWT token via the login API.
 */
async function getClientToken(request, email, password) {
  const res = await request.post(`${config.BASE_URL}/api/client/login`, {
    data: { email, password },
  });
  const body = await res.json();
  if (!res.ok()) throw new Error(`Client login failed: ${body.error || res.status()}`);
  return body.token;
}

/**
 * Return common auth headers for admin requests.
 */
function adminHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Return common auth headers for client requests.
 */
function clientHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  getAdminToken,
  createTestClient,
  getClientToken,
  adminHeaders,
  clientHeaders,
};
