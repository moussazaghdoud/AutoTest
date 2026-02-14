// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');
const { deleteReview } = require('../../helpers/cleanup');

test.describe('Admin Reviews API', () => {
  let adminToken;
  let createdReviewId;
  const ts = Date.now();

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    if (createdReviewId) {
      await deleteReview(request, adminToken, createdReviewId);
    }
  });

  test('GET /api/admin/reviews returns review list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/reviews`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/admin/reviews creates a review', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/reviews`, {
      headers: adminHeaders(adminToken),
      data: {
        authorName: `AutoTest Author ${ts}`,
        authorCompany: 'AutoTest Corp',
        authorAvatar: '',
        rating: 5,
        content: 'Excellent product! This is an automated test review.',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    createdReviewId = body.id;
  });

  test('PUT /api/admin/reviews/:id updates review', async ({ request }) => {
    if (!createdReviewId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/reviews/${createdReviewId}`, {
      headers: adminHeaders(adminToken),
      data: {
        authorName: `AutoTest Author Updated ${ts}`,
        authorCompany: 'AutoTest Corp',
        authorAvatar: '',
        rating: 4,
        content: 'Updated review content.',
        isApproved: 1,
      },
    });
    expect(res.status()).toBe(200);
  });

  test('PUT /api/admin/reviews/:id toggles approval', async ({ request }) => {
    if (!createdReviewId) test.skip();

    // First approve
    let res = await request.put(`${config.BASE_URL}/api/admin/reviews/${createdReviewId}`, {
      headers: adminHeaders(adminToken),
      data: { isApproved: 1 },
    });
    expect(res.status()).toBe(200);

    // Then un-approve
    res = await request.put(`${config.BASE_URL}/api/admin/reviews/${createdReviewId}`, {
      headers: adminHeaders(adminToken),
      data: { isApproved: 0 },
    });
    expect(res.status()).toBe(200);
  });

  test('DELETE /api/admin/reviews/:id deletes review', async ({ request }) => {
    if (!createdReviewId) test.skip();

    const res = await request.delete(`${config.BASE_URL}/api/admin/reviews/${createdReviewId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    createdReviewId = null;
  });
});
