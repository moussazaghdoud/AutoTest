// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, createTestClient, adminHeaders } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Admin Clients API', () => {
  let adminToken;
  let testClientId;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
    const client = await createTestClient(request);
    testClientId = client.user.id;
  });

  test.afterAll(async ({ request }) => {
    if (testClientId) {
      await deleteClient(request, adminToken, testClientId);
    }
  });

  test('GET /api/admin/clients returns client list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/clients`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/clients supports search filter', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/clients?search=${config.TEST_PREFIX}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/clients supports status filter', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/clients?status=active`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/admin/clients/:id returns client details', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/clients/${testClientId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(testClientId);
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('subscriptions');
  });

  test('PUT /api/admin/clients/:id updates client', async ({ request }) => {
    const res = await request.put(`${config.BASE_URL}/api/admin/clients/${testClientId}`, {
      headers: adminHeaders(adminToken),
      data: { company: 'Updated Corp' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('GET /api/admin/clients/:id returns 404 for nonexistent', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/clients/nonexistent-id`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(404);
  });
});
