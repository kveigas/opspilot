import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewsToTest = [
  { name: 'Today Dashboard', tabText: 'Today' },
  { name: 'Campaign Intake', tabText: 'Campaigns' },
  { name: 'Workforce Roster', tabText: 'Workforce' },
  { name: 'Domain Calibration', tabText: 'Calibration' },
  { name: 'Allocations Engine', tabText: 'Allocations' },
  { name: 'Execution Operations', tabText: 'Execution' },
  { name: 'QA & Escalations', tabText: 'QA & Escalations' },
  { name: 'Delivery Readiness', tabText: 'Delivery' },
];

test.describe('OpsPilot Automated Accessibility Suite', () => {
  for (const view of viewsToTest) {
    test(`view '${view.name}' has zero serious or critical accessibility violations`, async ({ page }) => {
      await page.goto('/');

      // Click corresponding navigation tab
      await page.getByRole('button', { name: view.tabText, exact: true }).click();

      // Run Axe accessibility scan
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
