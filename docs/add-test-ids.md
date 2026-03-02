# Adding Test IDs to Your Web Application

## Why `data-testid`?

AutoTest uses Playwright's resilient selector strategies, but the most reliable selectors are explicit `data-testid` attributes. These:
- Don't break when CSS classes change
- Don't break when text content changes
- Are clear signals of "this element is tested"
- Make tests deterministic and fast

## Selector Policy

AutoTest tries selectors in this priority order:

1. `data-testid` (most stable)
2. `role` + accessible name (good a11y practice)
3. `placeholder` text
4. `label` text
5. `name` attribute
6. Partial text match
7. CSS type selector (fallback)

## How to Add Test IDs

### Login Form
```html
<!-- Before -->
<input type="email" class="form-control" placeholder="Email">
<input type="password" class="form-control" placeholder="Password">
<button class="btn-primary">Sign In</button>

<!-- After -->
<input type="email" data-testid="login-email" placeholder="Email">
<input type="password" data-testid="login-password" placeholder="Password">
<button data-testid="login-submit" class="btn-primary">Sign In</button>
```

### Navigation
```html
<nav data-testid="main-nav">
  <a href="/dashboard" data-testid="nav-dashboard">Dashboard</a>
  <a href="/settings" data-testid="nav-settings">Settings</a>
  <a href="/profile" data-testid="nav-profile">Profile</a>
</nav>
```

### Forms
```html
<form data-testid="signup-form">
  <input data-testid="signup-name" name="name" placeholder="Full Name">
  <input data-testid="signup-email" name="email" type="email">
  <select data-testid="signup-plan" name="plan">
    <option value="free">Free</option>
    <option value="pro">Pro</option>
  </select>
  <button data-testid="signup-submit" type="submit">Create Account</button>
</form>
```

### Key Actions
```html
<button data-testid="logout-btn">Logout</button>
<button data-testid="delete-account-btn">Delete Account</button>
<button data-testid="save-settings-btn">Save</button>
```

## Naming Convention

Pattern: `{feature}-{element-type}`

Examples:
- `login-email`, `login-password`, `login-submit`
- `signup-form`, `signup-name`, `signup-submit`
- `nav-dashboard`, `nav-settings`
- `modal-confirm`, `modal-cancel`
- `chat-input`, `chat-send`

## Selector Audit

Run AutoTest's discovery scan on your app. The scan captures all UI elements (buttons, inputs, links). Review the discovery results to identify elements that lack stable selectors and would benefit from `data-testid`.

## React/Next.js Tip

```jsx
// Component with test ID
function LoginForm() {
  return (
    <form data-testid="login-form">
      <input data-testid="login-email" type="email" />
      <input data-testid="login-password" type="password" />
      <button data-testid="login-submit" type="submit">Sign In</button>
    </form>
  );
}
```

## Test-Mode Toggle (Optional)

For apps that have CAPTCHA or MFA, add a test-mode bypass:

```javascript
// In your app's middleware/config
if (process.env.TEST_MODE === 'true') {
  // Skip CAPTCHA verification
  // Accept a known MFA code (e.g., "000000")
  // Use test-specific rate limits
}
```

This is safe when:
- Only enabled via environment variable
- Never enabled in production
- Test accounts are separate from real accounts
