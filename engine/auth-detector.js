// Heuristic login page detection

async function detectAuthPage(page, url) {
  try {
    // Check for common login indicators
    const indicators = await page.evaluate(() => {
      const html = document.body.innerHTML.toLowerCase();
      const title = document.title.toLowerCase();
      const url = location.href.toLowerCase();

      const hasPasswordField = document.querySelector('input[type="password"]') !== null;
      const hasLoginText = /log\s?in|sign\s?in|authenticate/i.test(html);
      const hasLoginUrl = /login|signin|auth/i.test(url);
      const hasLoginTitle = /login|sign in|log in/i.test(title);
      const hasUsernameField = document.querySelector('input[name*="user"], input[name*="email"], input[type="email"]') !== null;

      return {
        hasPasswordField,
        hasLoginText,
        hasLoginUrl,
        hasLoginTitle,
        hasUsernameField,
      };
    });

    // Score: password + (username OR login text/url) = likely auth page
    const score =
      (indicators.hasPasswordField ? 3 : 0) +
      (indicators.hasUsernameField ? 2 : 0) +
      (indicators.hasLoginText ? 1 : 0) +
      (indicators.hasLoginUrl ? 1 : 0) +
      (indicators.hasLoginTitle ? 1 : 0);

    return score >= 4;
  } catch {
    return false;
  }
}

module.exports = { detectAuthPage };
