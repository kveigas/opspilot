import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'Desktop Large (1440x900)', width: 1440, height: 900 },
  { name: 'Tablet Landscape (1024x768)', width: 1024, height: 768 },
  { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
  { name: 'Mobile (375x667)', width: 375, height: 667 },
];

test.describe('OpsPilot Responsive Layout Validation Suite', () => {
  for (const vp of viewports) {
    test(`renders cleanly at ${vp.name} without horizontal page overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Verify no horizontal document scrollbar
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      // Verify header brand title visible
      await expect(page.getByText('OpsPilot', { exact: true })).toBeVisible();

      // Check view navigation tabs
      await page.getByRole('button', { name: 'Campaigns', exact: true }).click();
      await expect(page.getByText('Campaign Intake & Operational Config')).toBeVisible();
    });
  }
});
