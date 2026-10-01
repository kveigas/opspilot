import { test, expect } from '@playwright/test';

test.describe('Recruiter demo journey', () => {
  test('guided manager loop: escalation, quality-aware allocation, workday, QA evidence, delivery', async ({ page }) => {
    test.setTimeout(150000);

    // 1. The empty demo seeds itself once and the cockpit leads with the next best action.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What needs your attention' })).toBeVisible();
    await expect(page.getByText(/Simulated day/).first()).toBeVisible({ timeout: 45000 });
    await expect(page.getByText('Unable to start the OpsPilot demo')).toHaveCount(0);

    // 2. Resolve the critical escalation straight from the recommended action.
    await page.getByRole('button', { name: 'Open escalations', exact: true }).click();
    await expect(page.getByRole('tab', { name: /Escalations/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Update status' }).first().click();
    await page.getByLabel('Decision and rationale').fill('Client confirmed guideline 4.2; guideline v1.1 published.');
    await page.getByRole('button', { name: 'Save Update' }).click();
    await expect(page.getByText('Escalation status updated and queues refreshed.')).toBeVisible();

    // 3. Allocate with quality-aware routing (the default) and see why each annotator was chosen.
    await page.getByRole('button', { name: 'Allocate', exact: true }).click();
    await expect(page.getByText('Task Allocation Engine')).toBeVisible();
    await page.getByRole('button', { name: /Trigger Allocation Run/ }).click();
    await expect(page.getByText(/tasks allocated for/)).toBeVisible();
    await expect(page.getByText(/routed to TRUSTED annotator/).first()).toBeVisible();

    // 4. Advance the simulated day.
    await page.getByRole('button', { name: /Advance workday/ }).click();
    await expect(page.getByText(/Workday .* complete/)).toBeVisible({ timeout: 120000 });

    // 5. Quality insights explain trust tiers and delivered accuracy.
    await page.getByRole('button', { name: 'Quality insights', exact: true }).click();
    await expect(page.getByText('Estimated delivered accuracy')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Annotator trust table' })).toBeVisible();

    // 6. Delivery gates with evidence.
    await page.getByRole('button', { name: 'Delivery', exact: true }).click();
    await expect(page.getByText('Campaign Delivery Readiness')).toBeVisible();
    await expect(page.getByText('Mandatory gates')).toBeVisible({ timeout: 10000 });
  });
});
