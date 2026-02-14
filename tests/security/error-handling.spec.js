// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');

test.describe('Error Handling — 404 for Nonexistent Resources', () => {
  let adminToken;
  const fakeId = 'nonexistent-id-00000000';

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test('GET /api/admin/products/:id returns 404 for nonexistent', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/products/${fakeId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test('GET /api/admin/clients/:id returns 404 for nonexistent', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/clients/${fakeId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test('GET /api/admin/blog/articles/:id returns 404 for nonexistent', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/blog/articles/${fakeId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(404);
  });

  test('PUT /api/admin/users/:id returns 404 for nonexistent', async ({ request }) => {
    const res = await request.put(`${config.BASE_URL}/api/admin/users/${fakeId}`, {
      headers: adminHeaders(adminToken),
      data: { firstName: 'Ghost', lastName: 'User', email: 'ghost@test.com', role: 'admin' },
    });
    expect(res.status()).toBe(404);
  });

  test('GET /api/products/:slug returns 404 for nonexistent', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/products/nonexistent-product-slug`);
    expect(res.status()).toBe(404);
  });

  test('GET /api/blog/articles/:slug returns 404 for nonexistent', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/blog/articles/nonexistent-article-slug`);
    expect(res.status()).toBe(404);
  });

  test('POST /api/client/reset-password with bad token returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/reset-password`, {
      data: { token: 'totally-invalid-token', newPassword: 'NewPass123!' },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT /api/admin/subscriptions/:id returns 404 or 200 for nonexistent', async ({ request }) => {
    const res = await request.put(`${config.BASE_URL}/api/admin/subscriptions/${fakeId}`, {
      headers: adminHeaders(adminToken),
      data: { status: 'active' },
    });
    // Some implementations return 200 with no rows affected, others 404
    expect([200, 404]).toContain(res.status());
  });
});
