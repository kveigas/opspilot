import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewsToTest = [
  { name: 'Today', tabText: 'Today' },
  { name: 'Campaigns', tabText: 'Campaigns' },
  { name: 'Workforce', tabText: 'Workforce' },
  { name: 'Calibration', tabText: 'Calibration' },
  { name: 'Allocate', tabText: 'Allocate' },
  { name: 'Execute', tabText: 'Execute' },
  { name: 'QA review', tabText: 'QA review' },
  { name: 'Quality insights', tabText: 'Quality insights' },
  { name: 'Delivery', tabText: 'Delivery' },
];

test.describe('OpsPilot Automated Accessibility Suite', () => {
  for (const view of viewsToTest) {
    test(`view '${view.name}' has zero serious or critical accessibility violations`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: view.tabText, exact: true }).click();
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const seriousOrCritical = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      if (seriousOrCritical.length > 0) {
        console.error(`Accessibility violations in ${view.name}:`, JSON.stringify(seriousOrCritical, null, 2));
      }

      expect(seriousOrCritical.length).toBe(0);
    });
  }
});
