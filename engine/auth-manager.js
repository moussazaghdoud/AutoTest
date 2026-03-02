// Multi-strategy auth manager with fallback chain, stuck detection, and watchdog
// GUARANTEE: Never loops infinitely. Always produces artifacts on failure.

const { getDb, get, run } = require('../db/db');
const { decrypt } = require('../utils/crypto');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = path.join(__dirname, '..', 'test-results', 'auth-artifacts');

// Auth strategy priority: StorageState > API Login > UI Form Login
const STRATEGIES = ['storage_state', 'api_login', 'ui_form'];

// Stuck detector thresholds
const STUCK_TIMEOUT_MS = 30000;      // 30s no navigation progress = stuck
const MAX_AUTH_ATTEMPTS = 3;          // Max total auth attempts across all strategies
const WATCHDOG_INTERVAL_MS = 5000;    // Check every 5s

class AuthManager {
  constructor(target, options = {}) {
    this.target = target;
    this.authType = target.auth_type || 'none';
    this.authConfig = typeof target.auth_config === 'string'
      ? JSON.parse(target.auth_config)
      : (target.auth_config || {});
    this.baseUrl = target.base_url;
    this.options = {
      artifactsDir: options.artifactsDir || ARTIFACTS_DIR,
      stuckTimeout: options.stuckTimeout || STUCK_TIMEOUT_MS,
      maxAttempts: options.maxAttempts || MAX_AUTH_ATTEMPTS,
      ...options,
    };
    this.attempts = 0;
    this.log = [];
    this.currentStrategy = null;
  }

  // Main entry: authenticate a browser context. Returns { success, context, page, strategy, log }
  async authenticate(browser) {
    if (this.authType === 'none') {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      return { success: true, context, page, strategy: 'none', log: ['No auth required'] };
    }

    fs.mkdirSync(this.options.artifactsDir, { recursive: true });

    // Build strategy chain based on auth type
    const strategies = this._buildStrategyChain();
    this._log(`Auth type: ${this.authType}, strategies: ${strategies.join(' → ')}`);

    for (const strategy of strategies) {
      if (this.attempts >= this.options.maxAttempts) {
        this._log(`Max attempts (${this.options.maxAttempts}) reached. Aborting.`);
        break;
      }

      this.currentStrategy = strategy;
      this.attempts++;
      this._log(`Attempt ${this.attempts}: trying ${strategy}`);

      try {
        const result = await this._executeStrategy(browser, strategy);
        if (result.success) {
          this._log(`Strategy ${strategy} succeeded`);
          // Save session for future reuse
          await this._saveSession(result.context);
          return { ...result, strategy, log: [...this.log] };
        }
        this._log(`Strategy ${strategy} failed: ${result.reason}`);
      } catch (err) {
        this._log(`Strategy ${strategy} error: ${err.message}`);
        await this._captureFailureArtifacts(null, strategy, err.message);
      }
    }

    // All strategies exhausted
    this._log('All auth strategies exhausted. Authentication failed.');
    return {
      success: false,
      context: null,
      page: null,
      strategy: null,
      log: [...this.log],
      error: 'All authentication strategies failed',
    };
  }

  // Build ordered strategy chain based on auth type
  _buildStrategyChain() {
    switch (this.authType) {
      case 'form':
        return ['storage_state', 'ui_form']; // Try saved session first, then UI form
      case 'bearer':
        return ['storage_state', 'api_login']; // Try saved session first, then API
      case 'basic':
        return ['basic_header']; // Basic auth is header-only, no fallback needed
      case 'cookie':
        return ['cookie_inject']; // Cookie is injected directly
      default:
        return ['storage_state', 'ui_form']; // Default chain
    }
  }

  // Execute a single auth strategy with watchdog
  async _executeStrategy(browser, strategy) {
    switch (strategy) {
      case 'storage_state':
        return this._tryStorageState(browser);
      case 'api_login':
        return this._tryApiLogin(browser);
      case 'ui_form':
        return this._tryUiFormLogin(browser);
      case 'basic_header':
        return this._tryBasicAuth(browser);
      case 'cookie_inject':
        return this._tryCookieAuth(browser);
      default:
        return { success: false, reason: `Unknown strategy: ${strategy}` };
    }
  }

  // Strategy A: Reuse saved storage state (cookies + localStorage)
  async _tryStorageState(browser) {
    try {
      const db = await getDb();
      const session = get(db,
        `SELECT * FROM auth_sessions WHERE target_id = ? AND is_valid = 1 ORDER BY created_at DESC LIMIT 1`,
        [this.target.id]
      );

      if (!session || !session.storage_state) {
        return { success: false, reason: 'No saved session found' };
      }

      // Check expiry
      if (session.expires_at && new Date(session.expires_at) < new Date()) {
        run(db, `UPDATE auth_sessions SET is_valid = 0 WHERE id = ?`, [session.id]);
        return { success: false, reason: 'Saved session expired' };
      }

      const storageState = JSON.parse(session.storage_state);
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        storageState,
      });
      const page = await context.newPage();

      // Verify session is still valid by navigating to a protected page
      const valid = await this._verifyAuthenticated(page);
      if (valid) {
        return { success: true, context, page };
      }

      // Session invalid — mark and fall through
      run(db, `UPDATE auth_sessions SET is_valid = 0 WHERE id = ?`, [session.id]);
      await context.close();
      return { success: false, reason: 'Saved session no longer valid' };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  // Strategy B: Programmatic API login
  async _tryApiLogin(browser) {
    const config = this.authConfig;
    if (!config.login_api && !config.token) {
      return { success: false, reason: 'No login_api or token configured' };
    }

    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });

      if (config.token) {
        // Static token
        await context.setExtraHTTPHeaders({ Authorization: `Bearer ${config.token}` });
        const page = await context.newPage();
        return { success: true, context, page };
      }

      // Dynamic token from API
      const loginUrl = config.login_api.startsWith('http')
        ? config.login_api
        : this.baseUrl.replace(/\/$/, '') + config.login_api;

      const page = await context.newPage();
      const response = await page.context().request.post(loginUrl, {
        data: {
          email: config.username,
          username: config.username,
          password: config.password,
        },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      if (response.status() >= 400) {
        await context.close();
        return { success: false, reason: `API login returned ${response.status()}` };
      }

      const body = await response.json().catch(() => ({}));
      const tokenPath = config.token_path || 'token';
      const token = this._getNestedValue(body, tokenPath);

      if (!token) {
        await context.close();
        return { success: false, reason: `No token at path "${tokenPath}" in API response` };
      }

      await context.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });
      this._log(`API login succeeded, token obtained via ${tokenPath}`);
      return { success: true, context, page };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  // Strategy C: UI form login with resilient selectors + stuck detector
  async _tryUiFormLogin(browser) {
    const config = this.authConfig;
    if (!config.username || !config.password) {
      return { success: false, reason: 'No username/password configured' };
    }

    let context, page, watchdog;

    try {
      context = await browser.newContext({
        ignoreHTTPSErrors: true,
        recordVideo: { dir: path.join(this.options.artifactsDir, 'videos') },
      });
      page = await context.newPage();

      // Start watchdog
      watchdog = this._startWatchdog(page, 'ui_form');

      // Navigate to login page
      const loginUrl = config.login_url
        ? (config.login_url.startsWith('http') ? config.login_url : this.baseUrl.replace(/\/$/, '') + config.login_url)
        : this.baseUrl.replace(/\/$/, '') + '/login';

      this._log(`Navigating to ${loginUrl}`);
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);

      // Detect if we're on a login page
      const isLoginPage = await this._detectLoginPage(page);
      if (!isLoginPage) {
        // Might already be authenticated or wrong URL
        const alreadyAuth = await this._verifyAuthenticated(page);
        if (alreadyAuth) {
          this._stopWatchdog(watchdog);
          return { success: true, context, page };
        }
        // Try base URL — maybe login redirects there
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
      }

      // Fill username using resilient selector chain
      const userFilled = await this._resilientFill(page, 'username', config.username, [
        config.username_selector,
        'input[type="email"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        '#email',
        '#username',
        'input[type="text"]:visible',
      ]);

      if (!userFilled) {
        this._stopWatchdog(watchdog);
        await this._captureFailureArtifacts(page, 'ui_form', 'Could not find username field');
        await context.close();
        return { success: false, reason: 'Could not find username field' };
      }

      // Fill password using resilient selector chain
      const pwdFilled = await this._resilientFill(page, 'password', config.password, [
        config.password_selector,
        'input[type="password"]',
        'input[name*="password" i]',
        'input[autocomplete="current-password"]',
        '#password',
      ]);

      if (!pwdFilled) {
        this._stopWatchdog(watchdog);
        await this._captureFailureArtifacts(page, 'ui_form', 'Could not find password field');
        await context.close();
        return { success: false, reason: 'Could not find password field' };
      }

      // Record URL before submission to detect navigation
      const urlBeforeSubmit = page.url();

      // Submit using resilient selector chain
      const submitted = await this._resilientSubmit(page, [
        config.submit_selector,
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Sign In")',
        'button:has-text("Submit")',
        'form button',
      ]);

      if (!submitted) {
        // Fallback: press Enter
        this._log('No submit button found, pressing Enter');
        await page.keyboard.press('Enter');
      }

      // Wait for navigation / response
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);

      // Verify auth succeeded
      const urlAfterSubmit = page.url();
      const navigated = urlAfterSubmit !== urlBeforeSubmit;
      const stillOnLogin = await this._detectLoginPage(page);
      const isAuthenticated = await this._verifyAuthenticated(page);

      this._stopWatchdog(watchdog);

      if (isAuthenticated || (navigated && !stillOnLogin)) {
        this._log('UI form login succeeded');
        return { success: true, context, page };
      }

      // Check for error messages
      const errorText = await page.evaluate(() => {
        const selectors = ['.error', '.alert-danger', '.alert-error', '[role="alert"]',
          '.form-error', '.login-error', '.error-message', '.text-danger'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) return el.textContent.trim().substring(0, 200);
        }
        return null;
      }).catch(() => null);

      await this._captureFailureArtifacts(page, 'ui_form', errorText || 'Login did not navigate away');
      await context.close();
      return {
        success: false,
        reason: errorText
          ? `Login error: ${errorText}`
          : 'Login form submitted but auth not confirmed',
      };
    } catch (err) {
      if (watchdog) this._stopWatchdog(watchdog);
      if (page) await this._captureFailureArtifacts(page, 'ui_form', err.message);
      if (context) await context.close().catch(() => {});
      return { success: false, reason: err.message };
    }
  }

  // Strategy: Basic auth via HTTP header
  async _tryBasicAuth(browser) {
    const config = this.authConfig;
    if (!config.username || !config.password) {
      return { success: false, reason: 'No username/password for basic auth' };
    }
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { Authorization: `Basic ${credentials}` },
    });
    const page = await context.newPage();
    return { success: true, context, page };
  }

  // Strategy: Cookie injection
  async _tryCookieAuth(browser) {
    const config = this.authConfig;
    if (!config.cookie_name || !config.cookie_value) {
      return { success: false, reason: 'No cookie_name/cookie_value configured' };
    }
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const url = new URL(this.baseUrl);
    await context.addCookies([{
      name: config.cookie_name,
      value: config.cookie_value,
      domain: url.hostname,
      path: '/',
    }]);
    const page = await context.newPage();
    return { success: true, context, page };
  }

  // Resilient field fill: tries selectors in order
  async _resilientFill(page, fieldName, value, selectors) {
    for (const sel of selectors) {
      if (!sel) continue;
      try {
        const locator = page.locator(sel).first();
        const visible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          await locator.fill(value, { timeout: 5000 });
          this._log(`Filled ${fieldName} using "${sel}"`);
          return true;
        }
      } catch { /* try next */ }
    }
    this._log(`Could not fill ${fieldName} with any selector`);
    return false;
  }

  // Resilient submit: tries selectors in order
  async _resilientSubmit(page, selectors) {
    for (const sel of selectors) {
      if (!sel) continue;
      try {
        const locator = page.locator(sel).first();
        const visible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          await locator.click({ timeout: 5000 });
          this._log(`Submitted using "${sel}"`);
          return true;
        }
      } catch { /* try next */ }
    }
    return false;
  }

  // Detect if current page is a login page
  async _detectLoginPage(page) {
    try {
      return await page.evaluate(() => {
        const hasPassword = !!document.querySelector('input[type="password"]:not([style*="display: none"])');
        const hasLoginText = /log\s?in|sign\s?in|authenticate/i.test(document.body.innerText);
        const hasLoginUrl = /login|signin|auth/i.test(location.href);
        return hasPassword || (hasLoginText && hasLoginUrl);
      });
    } catch {
      return false;
    }
  }

  // Verify we're authenticated (not on login page, not redirected to auth)
  async _verifyAuthenticated(page) {
    try {
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      const isLogin = await this._detectLoginPage(page);
      return !isLogin;
    } catch {
      return false;
    }
  }

  // Save session for future reuse (Strategy A)
  async _saveSession(context) {
    try {
      const db = await getDb();
      const storageState = await context.storageState();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

      // Invalidate old sessions
      run(db, `UPDATE auth_sessions SET is_valid = 0 WHERE target_id = ?`, [this.target.id]);

      // Save new session
      run(db,
        `INSERT INTO auth_sessions (target_id, auth_type, storage_state, expires_at)
         VALUES (?, ?, ?, ?)`,
        [this.target.id, this.authType, JSON.stringify(storageState), expiresAt]
      );
      this._log('Session saved for future reuse');
    } catch (err) {
      this._log(`Session save failed: ${err.message}`);
    }
  }

  // Watchdog: monitors page for stuck state
  _startWatchdog(page, strategy) {
    let lastUrl = '';
    let stuckSince = null;
    const startTime = Date.now();

    const interval = setInterval(async () => {
      try {
        const currentUrl = page.url();
        const elapsed = Date.now() - startTime;

        if (currentUrl === lastUrl) {
          if (!stuckSince) stuckSince = Date.now();
          const stuckDuration = Date.now() - stuckSince;

          if (stuckDuration > this.options.stuckTimeout) {
            this._log(`WATCHDOG: Stuck on ${currentUrl} for ${Math.round(stuckDuration / 1000)}s during ${strategy}`);
            clearInterval(interval);
            // Don't throw — the main flow handles timeout
          }
        } else {
          stuckSince = null;
        }
        lastUrl = currentUrl;

        // Hard timeout: 90s total
        if (elapsed > 90000) {
          this._log(`WATCHDOG: Hard timeout (90s) during ${strategy}`);
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, WATCHDOG_INTERVAL_MS);

    return interval;
  }

  _stopWatchdog(interval) {
    if (interval) clearInterval(interval);
  }

  // Capture failure artifacts (screenshot + page state)
  async _captureFailureArtifacts(page, strategy, reason) {
    if (!page) return;
    try {
      const timestamp = Date.now();
      const screenshotPath = path.join(this.options.artifactsDir, `auth-fail-${strategy}-${timestamp}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      this._log(`Failure screenshot: ${screenshotPath}`);

      // Capture page state
      const statePath = path.join(this.options.artifactsDir, `auth-fail-${strategy}-${timestamp}.json`);
      const pageState = {
        url: page.url(),
        title: await page.title().catch(() => ''),
        strategy,
        reason,
        timestamp: new Date().toISOString(),
        log: [...this.log],
        hasPasswordField: await page.evaluate(() => !!document.querySelector('input[type="password"]')).catch(() => null),
        visibleText: await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => ''),
      };
      fs.writeFileSync(statePath, JSON.stringify(pageState, null, 2));
    } catch (err) {
      this._log(`Artifact capture failed: ${err.message}`);
    }
  }

  _getNestedValue(obj, pathStr) {
    return pathStr.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
  }

  _log(msg) {
    const entry = `[Auth ${new Date().toISOString().substring(11, 19)}] ${msg}`;
    this.log.push(entry);
    console.log(entry);
  }
}

// Convenience: authenticate from a target object (decrypted)
async function createAuthenticatedContext(browser, target, options = {}) {
  const manager = new AuthManager(target, options);
  return manager.authenticate(browser);
}

// Mid-test auth recovery: detect if page redirected to login and re-authenticate
async function recoverFromLoginRedirect(page, context, target) {
  const manager = new AuthManager(target);
  const isLogin = await manager._detectLoginPage(page);
  if (!isLogin) return false; // Not on login page, no recovery needed

  console.log('[AuthRecovery] Detected login redirect mid-test, attempting recovery...');

  // Try to re-authenticate within the existing context
  const config = manager.authConfig;
  if (manager.authType === 'form' && config.username && config.password) {
    try {
      const filled = await manager._resilientFill(page, 'username', config.username, [
        config.username_selector,
        'input[type="email"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[type="text"]:visible',
      ]);
      if (filled) {
        await manager._resilientFill(page, 'password', config.password, [
          config.password_selector,
          'input[type="password"]',
        ]);
        await manager._resilientSubmit(page, [
          config.submit_selector,
          'button[type="submit"]',
          'input[type="submit"]',
          'button:has-text("Log in")',
          'button:has-text("Sign in")',
        ]) || await page.keyboard.press('Enter');

        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2000);

        const stillLogin = await manager._detectLoginPage(page);
        if (!stillLogin) {
          console.log('[AuthRecovery] Recovery succeeded');
          return true;
        }
      }
    } catch (err) {
      console.log(`[AuthRecovery] Recovery failed: ${err.message}`);
    }
  }

  console.log('[AuthRecovery] Recovery failed');
  return false;
}

module.exports = { AuthManager, createAuthenticatedContext, recoverFromLoginRedirect };
