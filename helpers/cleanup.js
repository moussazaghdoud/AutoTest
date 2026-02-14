const config = require('../config');
const { getAdminToken, adminHeaders } = require('./auth-helper');

/**
 * Delete a client by ID via the admin API.
 */
async function deleteClient(request, adminToken, clientId) {
  await request.delete(`${config.BASE_URL}/api/admin/clients/${clientId}`, {
    headers: adminHeaders(adminToken),
  });
}

/**
 * Delete a product by ID via the admin API.
 */
async function deleteProduct(request, adminToken, productId) {
  await request.delete(`${config.BASE_URL}/api/admin/products/${productId}`, {
    headers: adminHeaders(adminToken),
  });
}

/**
 * Delete a blog article by ID via the admin API.
 */
async function deleteArticle(request, adminToken, articleId) {
  await request.delete(`${config.BASE_URL}/api/admin/blog/articles/${articleId}`, {
    headers: adminHeaders(adminToken),
  });
}

/**
 * Delete a blog category by ID via the admin API.
 */
async function deleteCategory(request, adminToken, categoryId) {
  await request.delete(`${config.BASE_URL}/api/admin/blog/categories/${categoryId}`, {
    headers: adminHeaders(adminToken),
  });
}

/**
 * Delete a review by ID via the admin API.
 */
async function deleteReview(request, adminToken, reviewId) {
  await request.delete(`${config.BASE_URL}/api/admin/reviews/${reviewId}`, {
    headers: adminHeaders(adminToken),
  });
}

/**
 * Delete a contact submission by ID via the admin API.
 */
async function deleteContact(request, adminToken, contactId) {
  await request.delete(`${config.BASE_URL}/api/admin/contacts/${contactId}`, {
    headers: adminHeaders(adminToken),
  });
}

/**
 * Delete an admin user by ID via the admin API.
 */
async function deleteAdminUser(request, adminToken, userId) {
  await request.delete(`${config.BASE_URL}/api/admin/users/${userId}`, {
    headers: adminHeaders(adminToken),
  });
}

module.exports = {
  deleteClient,
  deleteProduct,
  deleteArticle,
  deleteCategory,
  deleteReview,
  deleteContact,
  deleteAdminUser,
};
