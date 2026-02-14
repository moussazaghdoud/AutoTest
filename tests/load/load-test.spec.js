// @ts-check
const { test, expect } = require('@playwright/test');
const config = require('../../config');
const { getAdminToken, createTestClient, adminHeaders, clientHeaders } = require('../../helpers/auth-helper');
const { deleteClient } = require('../../helpers/cleanup');

test.describe('Load Test — Concurrent Users', () => {
  const concurrency = config.CONCURRENT_USERS;
  let adminToken;
  const clients = []; // { token, id }

  test.beforeAll(async ({ request }) => {
    adminToken = await getAdminToken(request);

    // Create test clients in parallel
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(createTestClient(request, {
        email: `${config.TEST_PREFIX}_load_${Date.now()}_${i}@test.com`,
      }));
    }
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'fulfilled') {
        clients.push({ token: r.value.token, id: r.value.user.id });
      }
    }
  });

  test.afterAll(async ({ request }) => {
    for (const c of clients) {
      await deleteClient(request, adminToken, c.id).catch(() => {});
    }
  });

  test(`${config.CONCURRENT_USERS} concurrent users — mixed API requests`, async ({ request }) => {
    const requestsPerUser = 20;
    const results = [];
    const errors = [];

    // Define the request mix for each user
    function buildRequests(clientToken) {
      return [
        // Public endpoints
        { method: 'GET', url: `${config.BASE_URL}/api/blog/articles` },
        { method: 'GET', url: `${config.BASE_URL}/api/blog/categories` },
        { method: 'GET', url: `${config.BASE_URL}/api/reviews` },
        { method: 'GET', url: `${config.BASE_URL}/api/content` },
        { method: 'GET', url: `${config.BASE_URL}/api/stripe-key` },
        // Authenticated endpoints
        { method: 'GET', url: `${config.BASE_URL}/api/client/me`, headers: clientHeaders(clientToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/client/subscriptions`, headers: clientHeaders(clientToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/client/payment-methods`, headers: clientHeaders(clientToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/client/invoices`, headers: clientHeaders(clientToken) },
        // Admin endpoints
        { method: 'GET', url: `${config.BASE_URL}/api/admin/stats`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/clients`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/products`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/subscriptions`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/blog/articles`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/blog/categories`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/reviews`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/contacts`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/audit-log?limit=10`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/email-log`, headers: adminHeaders(adminToken) },
        { method: 'GET', url: `${config.BASE_URL}/api/admin/users`, headers: adminHeaders(adminToken) },
      ];
    }

    // Execute all users concurrently
    const userPromises = clients.map(async (client, userIdx) => {
      const reqs = buildRequests(client.token).slice(0, requestsPerUser);
      for (const req of reqs) {
        const start = Date.now();
        try {
          const res = await request.get(req.url, {
            headers: req.headers || {},
          });
          const duration = Date.now() - start;
          results.push({
            user: userIdx,
            url: req.url.replace(config.BASE_URL, ''),
            status: res.status(),
            duration,
          });
          if (res.status() >= 500) {
            errors.push({ user: userIdx, url: req.url, status: res.status() });
          }
        } catch (err) {
          errors.push({ user: userIdx, url: req.url, error: err.message });
        }
      }
    });

    await Promise.all(userPromises);

    // Analyze results
    const totalRequests = results.length;
    const durations = results.map(r => r.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const p95Index = Math.floor(durations.sort((a, b) => a - b).length * 0.95);
    const p95Duration = durations[p95Index] || maxDuration;
    const errorRate = (errors.length / totalRequests * 100).toFixed(1);
    const slowRequests = results.filter(r => r.duration > config.TIMEOUTS.slow);

    console.log(`\n=== Load Test Results ===`);
    console.log(`Concurrent users: ${concurrency}`);
    console.log(`Total requests:   ${totalRequests}`);
    console.log(`Avg response:     ${avgDuration.toFixed(0)}ms`);
    console.log(`P95 response:     ${p95Duration}ms`);
    console.log(`Max response:     ${maxDuration}ms`);
    console.log(`Slow (>3s):       ${slowRequests.length}`);
    console.log(`Server errors:    ${errors.length} (${errorRate}%)`);
    console.log(`========================\n`);

    // Assertions
    expect(errors.length).toBe(0); // No server errors
    expect(avgDuration).toBeLessThan(5000); // Avg under 5s
  });
});
