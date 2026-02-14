// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');
const { deleteAdminUser } = require('../../helpers/cleanup');

test.describe('Admin Users API', () => {
  let adminToken;
  let createdUserId;
  const ts = Date.now();

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    if (createdUserId) {
      await deleteAdminUser(request, adminToken, createdUserId);
    }
  });

  test('GET /api/admin/users returns list of admins', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/users`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('email');
    expect(body[0]).toHaveProperty('role');
  });

  test('POST /api/admin/users creates a new admin', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/users`, {
      headers: adminHeaders(adminToken),
      data: {
        email: `${config.TEST_PREFIX}_admin_${ts}@test.com`,
        password: 'AdminTest123!',
        firstName: 'Test',
        lastName: `Admin${ts}`,
        role: 'admin',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body.email).toBe(`${config.TEST_PREFIX}_admin_${ts}@test.com`);
    createdUserId = body.id;
  });

  test('POST /api/admin/users with duplicate email returns 409', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/users`, {
      headers: adminHeaders(adminToken),
      data: {
        email: config.ADMIN_EMAIL,
        password: 'Test123!',
        firstName: 'Dup',
        lastName: 'Admin',
        role: 'admin',
      },
    });
    expect(res.status()).toBe(409);
  });

  test('PUT /api/admin/users/:id updates admin user', async ({ request }) => {
    if (!createdUserId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/users/${createdUserId}`, {
      headers: adminHeaders(adminToken),
      data: {
        firstName: 'Updated',
        lastName: 'Admin',
        email: `${config.TEST_PREFIX}_admin_${ts}@test.com`,
        role: 'admin',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('DELETE /api/admin/users/:id deletes admin user', async ({ request }) => {
    if (!createdUserId) test.skip();

    const res = await request.delete(`${config.BASE_URL}/api/admin/users/${createdUserId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    createdUserId = null; // Prevent duplicate cleanup
  });
});
