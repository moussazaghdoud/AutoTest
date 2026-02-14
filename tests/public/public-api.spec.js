// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');

test.describe('Public APIs', () => {
  test('GET /api/blog/articles returns published articles', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/blog/articles`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/blog/categories returns categories', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/blog/categories`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/reviews returns approved reviews', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/reviews`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // All returned reviews should be approved
    for (const r of body) {
      expect(r).not.toHaveProperty('isApproved', 0);
    }
  });

  test('POST /api/contact submits a contact form', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/contact`, {
      data: {
        name: 'AutoTest Contact',
        email: 'autotest-contact@test.com',
        subject: 'AutoTest Subject',
        message: 'This is an automated test message.',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeTruthy();
  });

  test('POST /api/contact rejects missing fields', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/contact`, {
      data: { name: 'Test' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/stripe-key returns publishable key', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/stripe-key`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('publishableKey');
  });

  test('GET /api/content returns content data', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/content`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
  });

  test('GET /api/blog/articles supports category filter', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/blog/articles?limit=5`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/blog/articles/:slug returns 404 for nonexistent slug', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/blog/articles/nonexistent-slug-${Date.now()}`);
    expect(res.status()).toBe(404);
  });
});
