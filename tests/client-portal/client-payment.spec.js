// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, createTestClient, clientHeaders } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Client Payment API', () => {
  let adminToken;
  let clientToken;
  let testClientId;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
    const client = await createTestClient(request);
    clientToken = client.token;
    testClientId = client.user.id;
  });

  test.afterAll(async ({ request }) => {
    if (testClientId) {
      await deleteClient(request, adminToken, testClientId);
    }
  });

  test('GET /api/client/payment-methods returns list (may be empty)', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/client/payment-methods`, {
      headers: clientHeaders(clientToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/client/payment-methods/setup-intent creates setup intent', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/payment-methods/setup-intent`, {
      headers: clientHeaders(clientToken),
    });
    // 200 if Stripe configured, 400 if no Stripe customer
    expect([200, 400]).toContain(res.status());
  });

  test('GET /api/client/invoices returns invoices', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/client/invoices`, {
      headers: clientHeaders(clientToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('invoices');
  });
});
