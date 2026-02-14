// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');

test.describe('Admin Subscriptions & Stats API', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test('GET /api/admin/subscriptions returns subscription list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/subscriptions`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/subscriptions supports status filter', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/subscriptions?status=active`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/stats returns dashboard stats', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/stats`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('totalClients');
    expect(body).toHaveProperty('activeSubscriptions');
    expect(body).toHaveProperty('mrr');
    expect(body).toHaveProperty('newClientsThisMonth');
    expect(body).toHaveProperty('pendingContacts');
    expect(typeof body.totalClients).toBe('number');
    expect(typeof body.activeSubscriptions).toBe('number');
  });
});
