import { test, expect } from '@playwright/test';

test.describe('Phase 4 Flagship Recruiter Demo Flow', () => {
  test('Complete 2-3 Minute Recruiter Evaluation Journey', async ({ page }) => {
    // Step 1: Open Application
    await page.goto('/');

    // Step 2: Load Public Demo Scenario
    const bootstrapPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/v1/demo/bootstrap') && resp.status() === 200
    );

    await page.getByRole('button', { name: '🚀 Load Public Demo Scenario' }).click();
    await bootstrapPromise;

    // Wait 500ms for React state update
    await page.waitForTimeout(500);

    // Step 3: Inspect Initial Unhealthy State on Today Cockpit
    await expect(page.getByText('Manager Today Cockpit')).toBeVisible();

    // Step 4: Resolve Critical Escalation via QA & Escalations Tab
    await page.getByRole('button', { name: 'QA & Escalations', exact: true }).click();
    await expect(page.getByText('QA & Escalations Operations')).toBeVisible();

    // Switch subtab to Escalations
    await page.getByRole('button', { name: /Escalations/i }).first().click();

    const updateBtn = page.getByRole('button', { name: 'Update Status' }).first();
    if (await updateBtn.isVisible()) {
      await updateBtn.click();
      await page.getByRole('button', { name: 'Save Update' }).click();
    }

    // Step 5: Domain Calibration Check
    await page.getByRole('button', { name: 'Calibration', exact: true }).click();
    await expect(page.getByText('Calibration & Qualification Engine')).toBeVisible();

    // Step 6: Allocation Trigger
    await page.getByRole('button', { name: 'Allocations', exact: true }).click();
    await expect(page.getByText('Task Allocation Engine')).toBeVisible();

    const triggerAllocBtn = page.getByRole('button', { name: /Trigger Allocation Run/i }).first();
    if (await triggerAllocBtn.isVisible() && !(await triggerAllocBtn.isDisabled())) {
      await triggerAllocBtn.click();
    }

    // Step 7: Advance Demo Workday via Header CTA
    await page.getByRole('button', { name: '⚡ Advance Workday' }).first().click();

    // Step 8: Inspect Delivery Readiness
    await page.getByRole('button', { name: 'Delivery', exact: true }).click();
    await expect(page.getByText('Campaign Delivery Readiness')).toBeVisible();
    await expect(page.getByText('Mandatory Delivery Gate Checklist')).toBeVisible({ timeout: 10000 });
  });
});
