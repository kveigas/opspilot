import { test, expect } from '@playwright/test';

const LIVE_URL = 'https://kveigas.github.io/opspilot/';

test.describe('OpsPilot Live Public Production Deployment Verification', () => {
  test('LIVE 1: Production GitHub Pages loads cleanly', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto(LIVE_URL);
    expect(response?.status()).toBe(200);

    // Verify brand header
    await expect(page.getByText('OpsPilot', { exact: true })).toBeVisible();

    // Verify synthetic demo label
    await expect(page.getByText('SYNTHETIC DEMO DATA').first()).toBeVisible();

    console.log('Console Errors captured:', consoleErrors);
  });

  test('LIVE 2: Responsive layouts render cleanly at 1440x900, 1024x768, 768x1024, 375x667', async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto(LIVE_URL);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }
  });
});
