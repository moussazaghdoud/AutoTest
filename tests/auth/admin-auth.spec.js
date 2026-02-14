// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');

test.describe('Admin Authentication API', () => {
  test('POST /api/admin/login with valid credentials', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/login`, {
      data: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user).toHaveProperty('email', config.ADMIN_EMAIL);
    expect(body.user).toHaveProperty('role');
  });

  test('POST /api/admin/login with bad credentials returns 401', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/login`, {
      data: { email: config.ADMIN_EMAIL, password: 'WrongPassword!' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/admin/login with missing fields returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/login`, {
      data: { email: config.ADMIN_EMAIL },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/admin/me returns admin profile', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${config.BASE_URL}/api/admin/me`, {
      headers: adminHeaders(token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('email', config.ADMIN_EMAIL);
    expect(body).toHaveProperty('firstName');
    expect(body).toHaveProperty('role');
  });

  test('POST /api/admin/change-password with wrong current password returns 400', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.post(`${config.BASE_URL}/api/admin/change-password`, {
      headers: adminHeaders(token),
      data: { currentPassword: 'WrongCurrent!', newPassword: 'NewPass123!' },
    });
    expect(res.status()).toBe(400);
  });
});
