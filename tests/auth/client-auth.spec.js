// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, createTestClient, getClientToken, adminHeaders, clientHeaders } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Client Authentication API', () => {
  let adminToken;
  let testClientId;
  let testEmail;
  let testPassword;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    if (testClientId) {
      await deleteClient(request, adminToken, testClientId);
    }
  });

  test('POST /api/client/register creates a new client', async ({ request }) => {
    const ts = Date.now();
    testEmail = `${config.TEST_PREFIX}_auth_${ts}@test.com`;
    testPassword = 'TestAuth123!';

    const res = await request.post(`${config.BASE_URL}/api/client/register`, {
      data: {
        email: testEmail,
        password: testPassword,
        firstName: 'Auth',
        lastName: `Test${ts}`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user).toHaveProperty('id');
    expect(body.user.email).toBe(testEmail);
    testClientId = body.user.id;
  });

  test('POST /api/client/register with duplicate email returns 409', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/register`, {
      data: {
        email: testEmail,
        password: 'AnotherPass123!',
        firstName: 'Dup',
        lastName: 'User',
      },
    });
    expect(res.status()).toBe(409);
  });

  test('POST /api/client/login with valid credentials', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/login`, {
      data: { email: testEmail, password: testPassword },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe(testEmail);
  });

  test('POST /api/client/login with bad credentials returns 401', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/login`, {
      data: { email: testEmail, password: 'Wrong!' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/client/register-step2 completes profile', async ({ request }) => {
    const token = await getClientToken(request, testEmail, testPassword);
    const res = await request.post(`${config.BASE_URL}/api/client/register-step2`, {
      headers: clientHeaders(token),
      data: {
        company: 'AutoTest Corp',
        companySize: '10-50',
        phone: '+33123456789',
        address: '123 Test St',
        city: 'Paris',
        country: 'France',
        postalCode: '75001',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('GET /api/client/me returns client profile', async ({ request }) => {
    const token = await getClientToken(request, testEmail, testPassword);
    const res = await request.get(`${config.BASE_URL}/api/client/me`, {
      headers: clientHeaders(token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(testEmail);
    expect(body.company).toBe('AutoTest Corp');
  });

  test('PUT /api/client/me updates client profile', async ({ request }) => {
    const token = await getClientToken(request, testEmail, testPassword);
    const res = await request.put(`${config.BASE_URL}/api/client/me`, {
      headers: clientHeaders(token),
      data: { company: 'AutoTest Corp Updated' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('POST /api/client/forgot-password returns success', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/forgot-password`, {
      data: { email: testEmail },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('POST /api/client/reset-password with invalid token returns 400', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/client/reset-password`, {
      data: { token: 'invalid-token', newPassword: 'NewPass123!' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/client/check-existing returns true for existing email', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/client/check-existing?email=${encodeURIComponent(testEmail)}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
  });

  test('GET /api/client/check-existing returns false for nonexistent email', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/client/check-existing?email=nonexistent_${Date.now()}@test.com`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
  });
});
