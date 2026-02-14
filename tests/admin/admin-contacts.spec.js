// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, adminHeaders } = require('../../helpers/auth-helper');
const { deleteContact } = require('../../helpers/cleanup');

test.describe('Admin Contacts API', () => {
  let adminToken;
  let createdContactId;

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);

    // Create a contact submission for testing
    const res = await request.post(`${config.BASE_URL}/api/contact`, {
      data: {
        name: 'AutoTest Contact Admin',
        email: `autotest-admin-contact-${Date.now()}@test.com`,
        subject: 'AutoTest Admin Subject',
        message: 'Automated test contact message for admin tests.',
      },
    });
    if (res.ok()) {
      const body = await res.json();
      createdContactId = body.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (createdContactId) {
      await deleteContact(request, adminToken, createdContactId);
    }
  });

  test('GET /api/admin/contacts returns contact list', async ({ request }) => {
    const res = await request.get(`${config.BASE_URL}/api/admin/contacts`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('PUT /api/admin/contacts/:id updates status and notes', async ({ request }) => {
    if (!createdContactId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/contacts/${createdContactId}`, {
      headers: adminHeaders(adminToken),
      data: {
        status: 'in-progress',
        adminNotes: 'Being reviewed by automated tests',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('PUT /api/admin/contacts/:id marks as resolved', async ({ request }) => {
    if (!createdContactId) test.skip();

    const res = await request.put(`${config.BASE_URL}/api/admin/contacts/${createdContactId}`, {
      headers: adminHeaders(adminToken),
      data: {
        status: 'resolved',
        adminNotes: 'Resolved by automated tests',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('DELETE /api/admin/contacts/:id deletes contact', async ({ request }) => {
    if (!createdContactId) test.skip();

    const res = await request.delete(`${config.BASE_URL}/api/admin/contacts/${createdContactId}`, {
      headers: adminHeaders(adminToken),
    });
    expect(res.status()).toBe(200);
    createdContactId = null;
  });
});
