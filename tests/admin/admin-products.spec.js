// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');
const { deleteProduct } = require('../../helpers/cleanup');

test.describe('Admin Products API', () => {
  let adminToken;
  let createdProductId;
  const ts = Date.now();
  const slug = `${config.TEST_PREFIX}-product-${ts}`;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    if (createdProductId) {
      await deleteProduct(request, adminToken, createdProductId);
    }
  });

  test('GET /api/admin/products returns product list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/products`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/admin/products creates a product', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/products`, {
      headers: adminHeaders(adminToken),
      data: {
        name: `AutoTest Product ${ts}`,
        slug,
        shortDescription: 'Automated test product',
        fullDescription: 'Full description for automated test product',
        benefits: ['Fast', 'Reliable', 'Scalable'],
        gallery: [],
        plans: {
          free: { name: 'Free Plan', pricePerUser: 0, stripePriceId: '' },
          pro: { name: 'Pro Plan', pricePerUser: 19.99, stripePriceId: 'price_test' },
        },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    createdProductId = body.id;
  });

  test('POST /api/admin/products with duplicate slug returns 409', async ({ request }) => {
    if (!createdProductId) test.skip();

    const res = await request.post(`${config.BASE_URL}/api/admin/products`, {
      headers: adminHeaders(adminToken),
      data: {
        name: 'Duplicate Slug Product',
        slug,
        shortDescription: 'Dup',
        fullDescription: 'Dup',
        benefits: [],
        gallery: [],
        plans: {},
      },
    });
    expect(res.status()).toBe(409);
  });

  test('GET /api/admin/products/:id returns product details', async ({ request }) => {
    if (!createdProductId) test.skip();

    const res = await request.get(`${config.BASE_URL}/api/admin/products/${createdProductId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe(slug);
    expect(body).toHaveProperty('benefits');
    expect(body).toHaveProperty('plans');
  });

  test('PUT /api/admin/products/:id updates product', async ({ request }) => {
    if (!createdProductId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/products/${createdProductId}`, {
      headers: adminHeaders(adminToken),
      data: {
        name: `AutoTest Product Updated ${ts}`,
        slug,
        shortDescription: 'Updated short description',
        fullDescription: 'Updated full description',
        benefits: ['Fast', 'Reliable'],
        gallery: [],
        plans: {
          free: { name: 'Free Plan', pricePerUser: 0, stripePriceId: '' },
        },
      },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /api/products/:slug returns product publicly', async ({ request }) => {
    if (!createdProductId) test.skip();

    const res = await request.get(`${config.BASE_URL}/api/products/${slug}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toContain('AutoTest Product');
  });

  test('DELETE /api/admin/products/:id deletes product', async ({ request }) => {
    if (!createdProductId) test.skip();

    const res = await request.delete(`${config.BASE_URL}/api/admin/products/${createdProductId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    createdProductId = null;
  });
});
