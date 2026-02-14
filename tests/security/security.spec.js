// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, createTestClient, adminHeaders, clientHeaders } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Security — Unauthorized Access (401/403)', () => {
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

  // --- Admin endpoints without token → 401 ---
  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/me' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'POST', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/clients' },
    { method: 'GET', path: '/api/admin/products' },
    { method: 'POST', path: '/api/admin/products' },
    { method: 'GET', path: '/api/admin/subscriptions' },
    { method: 'GET', path: '/api/admin/stats' },
    { method: 'GET', path: '/api/admin/blog/categories' },
    { method: 'GET', path: '/api/admin/blog/articles' },
    { method: 'GET', path: '/api/admin/reviews' },
    { method: 'GET', path: '/api/admin/contacts' },
    { method: 'GET', path: '/api/admin/audit-log' },
    { method: 'GET', path: '/api/admin/email-log' },
    { method: 'POST', path: '/api/content' },
  ];

  for (const ep of adminEndpoints) {
    test(`${ep.method} ${ep.path} without token returns 401`, async ({ request }) => {
      let res;
      if (ep.method === 'GET') {
        res = await request.get(`${config.BASE_URL}${ep.path}`);
      } else {
        res = await request.post(`${config.BASE_URL}${ep.path}`, { data: {} });
      }
      expect(res.status()).toBe(401);
    });
  }

  // --- Admin endpoints with client token → 403 ---
  const adminOnlyEndpoints = [
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/clients' },
    { method: 'GET', path: '/api/admin/products' },
    { method: 'GET', path: '/api/admin/stats' },
    { method: 'GET', path: '/api/admin/audit-log' },
  ];

  for (const ep of adminOnlyEndpoints) {
    test(`${ep.method} ${ep.path} with client token returns 403`, async ({ request }) => {
      const res = await request.get(`${config.BASE_URL}${ep.path}`, {
        headers: clientHeaders(clientToken),
      });
      expect(res.status()).toBe(403);
    });
  }

  // --- Client endpoints without token → 401 ---
  const clientEndpoints = [
    { method: 'GET', path: '/api/client/me' },
    { method: 'GET', path: '/api/client/subscriptions' },
    { method: 'GET', path: '/api/client/payment-methods' },
    { method: 'GET', path: '/api/client/invoices' },
  ];

  for (const ep of clientEndpoints) {
    test(`${ep.method} ${ep.path} without token returns 401`, async ({ request }) => {
      const res = await request.get(`${config.BASE_URL}${ep.path}`);
      expect(res.status()).toBe(401);
    });
  }

  // --- Client endpoints with admin token → 403 ---
  const clientOnlyEndpoints = [
    { method: 'GET', path: '/api/client/me' },
    { method: 'GET', path: '/api/client/subscriptions' },
    { method: 'GET', path: '/api/client/payment-methods' },
  ];

  for (const ep of clientOnlyEndpoints) {
    test(`${ep.method} ${ep.path} with admin token returns 403`, async ({ request }) => {
      const res = await request.get(`${config.BASE_URL}${ep.path}`, {
        headers: adminHeaders(adminToken),
      });
      expect(res.status()).toBe(403);
    });
  }
});
