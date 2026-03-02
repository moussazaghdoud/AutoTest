# Troubleshooting Guide

## Login Issues

### "All authentication strategies failed"

**Cause**: None of the auth strategies (storage state, API, UI form) could authenticate.

**Steps to fix:**
1. Verify credentials in target config (Targets → Edit)
2. Use "Detect Login Form" to auto-detect selectors
3. Check if the login URL is correct (default: `/login`)
4. Check if CAPTCHA/MFA is blocking automated login
5. Look at auth failure artifacts in `test-results/auth-artifacts/`

### Tests stuck on login page

**This should not happen with v3.** The auth manager has:
- **Watchdog**: aborts after 30s of no navigation progress
- **Max attempts**: 3 total across all strategies
- **Login redirect recovery**: mid-test auto-re-authentication

If it still happens:
1. Check `test-results/auth-artifacts/` for screenshots and state JSON
2. Verify the auth type matches your app (form vs bearer vs basic)
3. Try increasing `stuckTimeout` in auth options

### CAPTCHA/MFA blocking login

**Options:**
1. Create a test account that bypasses CAPTCHA/MFA
2. Add a test-mode toggle to your app (see `docs/add-test-ids.md`)
3. Use cookie-based auth with a manually-obtained session cookie
4. Use bearer token auth with a manually-obtained API token

## Flaky Test Policy

### What counts as flaky?

A test is "flaky" when it:
- Fails on some runs but passes on retries (detected automatically)
- Has a failure rate >20% across 3+ runs

### Auto-quarantine

Tests with >30% failure rate after 3+ runs are auto-quarantined.
Quarantined tests are **skipped** during execution (grep-invert).

### Manual quarantine

Use the Flakiness Monitor view to manually quarantine/unquarantine tests.

### Fixing flaky tests

Common causes:
1. **Timing**: Add explicit `waitFor` instead of `waitForTimeout`
2. **Selectors**: Use `data-testid` instead of text-based selectors
3. **Test isolation**: Tests shouldn't depend on order
4. **Network**: Increase timeouts for slow API responses
5. **State**: Clean up test data between runs

## Common Errors

### "OPENAI_API_KEY not set"
Set `OPENAI_API_KEY=sk-...` in your `.env` file. Required for AI test generation.

### "No test files generated"
- Ensure discovery scan completed successfully
- Check that at least one test type is selected
- If using AI-only mode, ensure OPENAI_API_KEY is set

### "Playwright execution failed"
- Run `npx playwright install --with-deps chromium` to install browser
- Check that `generated-tests/` contains `.spec.js` files
- Review `test-results/artifacts/*/logs/playwright-stderr.log`

### "Failed to parse test results"
- The Playwright JSON reporter output was corrupted
- Check `test-results/run-*.json` for valid JSON
- The fallback parser will extract pass/fail counts from stdout

### Port 4000 already in use
```bash
# Find and kill the process
lsof -ti:4000 | xargs kill -9
# Or use a different port
PORT=4001 npm start
```

## Performance Tips

1. **Parallelization**: Increase `workers` in Playwright config (default: 2)
2. **Selective execution**: Use test types checkboxes to skip unneeded tests
3. **AI-only mode**: Skip template tests when using AI test generation
4. **Headless mode**: Always enabled by default for speed
5. **Network**: Tests run faster with a local/staging environment vs production

## Coding Standards

### Adding a new test generator

1. Create `generator/my-tests.js` with a `generateMyTests(data, baseUrl)` function
2. Return a string of valid Playwright test code or empty string
3. Register it in `generator/test-generator.js`:
   ```javascript
   if (testTypes.includes('my_type')) {
     const code = generateMyTests(pages, baseUrl);
     if (code) { fs.writeFileSync(path.join(OUTPUT_DIR, 'my-type.spec.js'), code); generated.push('my-type'); }
   }
   ```
4. Add the checkbox in `public/index.html` test types section

### Adding a new dashboard view

1. Create `public/js/my-view.js` with `MyView = { init() {}, load() {} }`
2. Add the `<section>` in `public/index.html`
3. Add the nav link in sidebar
4. Register in `public/js/app.js`: `MyView.init()` and `switchView` handler
5. Add any API endpoints in `server.js`

### Test code conventions

- Always use `test.setTimeout()` in describe blocks
- Wrap interactions in `try/catch` (re-throw assertions)
- Use `page.waitForLoadState('networkidle')` after navigation
- Prefer role-based selectors: `page.getByRole('button', { name: '...' })`
- Keep tests independent — no shared state between tests
