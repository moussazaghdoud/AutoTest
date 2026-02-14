// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');
const { deleteArticle, deleteCategory } = require('../../helpers/cleanup');

test.describe('Admin Blog API', () => {
  let adminToken;
  let createdCategoryId;
  let createdArticleId;
  const ts = Date.now();

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);
  });

  test.afterAll(async ({ request }) => {
    if (createdArticleId) {
      await deleteArticle(request, adminToken, createdArticleId);
    }
    if (createdCategoryId) {
      await deleteCategory(request, adminToken, createdCategoryId);
    }
  });

  // --- Categories ---

  test('GET /api/admin/blog/categories returns list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/blog/categories`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/admin/blog/categories creates a category', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/blog/categories`, {
      headers: adminHeaders(adminToken),
      data: {
        name: `AutoTest Category ${ts}`,
        slug: `autotest-cat-${ts}`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    createdCategoryId = body.id;
  });

  test('PUT /api/admin/blog/categories/:id updates category', async ({ request }) => {
    if (!createdCategoryId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/blog/categories/${createdCategoryId}`, {
      headers: adminHeaders(adminToken),
      data: { name: `AutoTest Category Updated ${ts}`, slug: `autotest-cat-${ts}` },
    });
    expect(res.status()).toBe(200);
  });

  // --- Articles ---

  test('GET /api/admin/blog/articles returns list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/blog/articles`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/admin/blog/articles creates an article', async ({ request }) => {
    const res = await request.post(`${config.BASE_URL}/api/admin/blog/articles`, {
      headers: adminHeaders(adminToken),
      data: {
        title: `AutoTest Article ${ts}`,
        slug: `autotest-article-${ts}`,
        excerpt: 'Test excerpt for automated testing',
        content: '<p>Test content for automated testing</p>',
        coverImage: '',
        categoryId: createdCategoryId || null,
        status: 'published',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    createdArticleId = body.id;
  });

  test('GET /api/admin/blog/articles/:id returns article', async ({ request }) => {
    if (!createdArticleId) test.skip();

    const res = await request.get(`${config.BASE_URL}/api/admin/blog/articles/${createdArticleId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.title).toContain('AutoTest Article');
  });

  test('PUT /api/admin/blog/articles/:id updates article', async ({ request }) => {
    if (!createdArticleId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/blog/articles/${createdArticleId}`, {
      headers: adminHeaders(adminToken),
      data: {
        title: `AutoTest Article Updated ${ts}`,
        slug: `autotest-article-${ts}`,
        excerpt: 'Updated excerpt',
        content: '<p>Updated content</p>',
        coverImage: '',
        categoryId: createdCategoryId || null,
        status: 'published',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /api/blog/articles/:slug returns published article publicly', async ({ request }) => {
    if (!createdArticleId) test.skip();

    const res = await request.get(`${config.BASE_URL}/api/blog/articles/autotest-article-${ts}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.title).toContain('AutoTest Article');
  });
});
