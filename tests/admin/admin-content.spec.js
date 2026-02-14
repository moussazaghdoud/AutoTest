// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');

test.describe('Admin Content API', () => {
  let adminToken;
  let originalContent;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);

    // Save original content to restore later
    const res = await request.get(`${config.BASE_URL}/api/content`);
    if (res.ok()) {
      originalContent = await res.json();
    }
  });

  test.afterAll(async ({ request }) => {
    // Restore original content
    if (originalContent) {
      await request.post(`${config.BASE_URL}/api/content`, {
        headers: adminHeaders(adminToken),
        data: originalContent,
      });
    }
  });

  test('GET /api/content returns content object', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/content`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
  });

  test('POST /api/content updates content (admin)', async ({ request }) => {
    const testContent = {
      ...(originalContent || {}),
      _autotest: `Updated at ${Date.now()}`,
    };

    const res = await request.post(`${config.BASE_URL}/api/content`, {
      headers: adminHeaders(adminToken),
      data: testContent,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it was saved
    const getRes = await request.get(`${config.BASE_URL}/api/content`);
    expect(getRes.status()).toBe(200);
    const saved = await getRes.json();
    expect(saved._autotest).toBeTruthy();
  });

  test('POST /api/content without admin token returns 401', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/content`, {
      data: { test: 'should fail' },
    });
    expect(res.status()).toBe(401);
  });
});
