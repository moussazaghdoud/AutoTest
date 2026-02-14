const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  CONCURRENT_USERS: parseInt(process.env.CONCURRENT_USERS || '3', 10),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@rainbow.ale.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin123!',
  TIMEOUTS: {
    navigation: 30000,
    api: 15000,
    slow: 3000,
  },
  TEST_PREFIX: 'autotest',
};
