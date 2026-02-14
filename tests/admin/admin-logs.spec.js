// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');

test.describe('Admin Logs API', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test('GET /api/admin/audit-log returns audit entries', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/audit-log`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/audit-log supports limit parameter', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/audit-log?limit=5`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/admin/email-log returns email entries', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/email-log`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
