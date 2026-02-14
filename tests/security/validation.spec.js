// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');

test.describe('Validation — Missing/Invalid Fields (400)', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  // --- Auth validation ---

  test('POST /api/admin/login missing password returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/login`, {
      data: { email: 'test@test.com' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/admin/login missing email returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/login`, {
      data: { password: 'test' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/client/register missing fields returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/register`, {
      data: { email: 'test@test.com' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/client/register missing email returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/register`, {
      data: { password: 'Test123!', firstName: 'A', lastName: 'B' },
    });
    expect(res.status()).toBe(400);
  });

  // --- Admin CRUD validation ---

  test('POST /api/admin/users missing email returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/users`, {
      headers: adminHeaders(adminToken),
      data: { password: 'Test123!', firstName: 'A', lastName: 'B' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/admin/products missing name returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/products`, {
      headers: adminHeaders(adminToken),
      data: { slug: 'test-slug' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/admin/blog/categories missing name returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/blog/categories`, {
      headers: adminHeaders(adminToken),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/admin/blog/articles missing title returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/blog/articles`, {
      headers: adminHeaders(adminToken),
      data: { content: 'Some content' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/admin/reviews missing rating returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/reviews`, {
      headers: adminHeaders(adminToken),
      data: { authorName: 'Test' },
    });
    expect(res.status()).toBe(400);
  });

  // --- Contact validation ---

  test('POST /api/contact missing name returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/contact`, {
      data: { email: 'test@test.com', message: 'hello' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/contact missing email returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/contact`, {
      data: { name: 'Test', message: 'hello' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/contact empty body returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/contact`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  // --- Change password validation ---

  test('POST /api/admin/change-password missing fields returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/change-password`, {
      headers: adminHeaders(adminToken),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  // --- Check-existing validation ---

  test('GET /api/client/check-existing without email returns 400', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/client/check-existing`);
    expect(res.status()).toBe(400);
  });
});
