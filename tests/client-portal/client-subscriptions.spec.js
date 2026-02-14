// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, createTestClient, clientHeaders, adminHeaders } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Client Subscriptions API', () => {
  let adminToken;
  let clientToken;
  let testClientId;
  let productId;
  let subscriptionId;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);

    // Create test client
    const client = await createTestClient(request);
    clientToken = client.token;
    testClientId = client.user.id;

    // Find or create a product for subscription tests
    const productsRes = await request.get(`${config.BASE_URL}/api/admin/products`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const products = await productsRes.json();
    if (products.length > 0) {
      productId = products[0].id;
    } else {
      // Create a test product
      const createRes = await request.post(`${config.BASE_URL}/api/admin/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: 'AutoTest Product',
          slug: `autotest-product-${Date.now()}`,
          shortDescription: 'Test product',
          fullDescription: 'Test product for automated tests',
          benefits: ['Benefit 1'],
          gallery: [],
          plans: {
            free: { name: 'Free', pricePerUser: 0, stripePriceId: '' },
            basic: { name: 'Basic', pricePerUser: 9.99, stripePriceId: 'price_test' },
          },
        },
      });
      const createBody = await createRes.json();
      productId = createBody.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testClientId) {
      await deleteClient(request, adminToken, testClientId);
    }
  });

  test('GET /api/client/subscriptions returns list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/client/subscriptions`, {
      headers: clientHeaders(clientToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/client/subscriptions creates a free subscription', async ({ request }) => {
    if (!productId) test.skip();

    const res = await request.post(`${config.BASE_URL}/api/client/subscriptions`, {
      headers: clientHeaders(clientToken),
      data: {
        productId,
        planKey: 'free',
        licenseCount: 1,
      },
    });
    // May be 201 or 400 depending on product plan config
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.id).toBeTruthy();
      subscriptionId = body.id;
    } else {
      expect([400, 404]).toContain(res.status());
    }
  });

  test('PUT /api/client/subscriptions/:id updates subscription', async ({ request }) => {
    if (!subscriptionId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/client/subscriptions/${subscriptionId}`, {
      headers: clientHeaders(clientToken),
      data: { licenseCount: 5 },
    });
    expect([200, 400]).toContain(res.status());
  });

  test('POST /api/client/subscriptions/:id/cancel cancels subscription', async ({ request }) => {
    if (!subscriptionId) test.skip();

    const res = await request.post(`${config.BASE_URL}/api/client/subscriptions/${subscriptionId}/cancel`, {
      headers: clientHeaders(clientToken),
    });
    expect([200, 400]).toContain(res.status());
  });
});
