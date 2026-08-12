import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://127.0.0.1:8000/api/v1';
const APP_URL = 'http://localhost:5173/';
const OUTPUT_DIR = path.resolve(process.cwd(), '../portfolio-screenshots');

// Explicit one-off capture script - skip during routine E2E test runs
test.describe.skip('OpsPilot Targeted Screenshot Recapture', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  test('Recapture Allocations, QA, and Delivery Screenshots with Full Realized Operational Data', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const bootRes = await page.request.post(`${API_BASE}/demo/bootstrap?reset=true`);
    expect(bootRes.status()).toBe(200);

    await page.request.patch(`${API_BASE}/escalations/demo-esc-guidelines-01/status`, {
      data: {
        status: 'RESOLVED',
        resolution_notes: 'Model preference standard clarified with client guideline section 4.2.'
      }
    });

    const roundsRes = await page.request.get(`${API_BASE}/calibrations/rounds?campaign_id=demo-campaign-ai-eval`);
    const rounds = await roundsRes.json();
    if (rounds.length > 0) {
      await page.request.post(`${API_BASE}/calibrations/rounds/${rounds[0].id}/results`, {
        data: {
          worker_id: 'demo-worker-ann-11',
          round_id: rounds[0].id,
          score: 95.0,
          notes: 'Re-calibrated with model preference standard.'
        }
      });
    }

    await page.request.patch(`${API_BASE}/capacity/demo-worker-ann-12`, {
      data: {
        capacity_date: '2026-08-11',
        max_daily_capacity: 150
      }
    });

    const allocTriggerRes = await page.request.post(`${API_BASE}/allocations/trigger`, {
      data: {
        campaign_id: 'demo-campaign-ai-eval',
        operational_date: '2026-08-11',
        max_tasks: 800
      }
    });
    expect([200, 201]).toContain(allocTriggerRes.status());

    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Allocations', exact: true }).click();
    await expect(page.getByText('Task Allocation Engine')).toBeVisible();

    await expect(page.getByText('Loading allocations...')).not.toBeVisible();
    await page.waitForTimeout(2000);

    const allocPath = path.join(OUTPUT_DIR, 'opspilot-allocations.png');
    await page.screenshot({ path: allocPath });

    await page.request.post(`${API_BASE}/demo/advance-workday?campaign_id=demo-campaign-ai-eval`);
    await page.request.post(`${API_BASE}/qa/sample?campaign_id=demo-campaign-ai-eval`);

    const inReviewRes = await page.request.get(`${API_BASE}/tasks?campaign_id=demo-campaign-ai-eval&state=IN_REVIEW&limit=10`);
    const inReviewTasks = await inReviewRes.json();

    if (inReviewTasks.length >= 3) {
      await page.request.post(`${API_BASE}/reviews/tasks/${inReviewTasks[0].id}/verdict`, {
        data: {
          task_id: inReviewTasks[0].id,
          reviewer_id: 'demo-worker-rev-15',
          verdict: 'ACCEPT',
          reason_code: 'LABEL_ERROR',
          comment: 'Approved. Guidelines followed cleanly.'
        }
      });

      await page.request.post(`${API_BASE}/reviews/tasks/${inReviewTasks[1].id}/verdict`, {
        data: {
          task_id: inReviewTasks[1].id,
          reviewer_id: 'demo-worker-rev-15',
          verdict: 'REJECT_REWORK',
          reason_code: 'LABEL_ERROR',
          comment: 'Incorrect entity boundaries on prompt #4. Please fix span selection.'
        }
      });

      await page.request.post(`${API_BASE}/reviews/tasks/${inReviewTasks[2].id}/verdict`, {
        data: {
          task_id: inReviewTasks[2].id,
          reviewer_id: 'demo-worker-rev-16',
          verdict: 'ACCEPT',
          reason_code: 'LABEL_ERROR',
          comment: 'High accuracy annotation verified.'
        }
      });
    }

    await page.getByRole('button', { name: 'QA & Escalations', exact: true }).click();
    await expect(page.getByText('QA & Escalations Operations')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const qaPath = path.join(OUTPUT_DIR, 'opspilot-qa-escalations.png');
    await page.screenshot({ path: qaPath });

    for (let i = 0; i < 4; i++) {
      await page.request.post(`${API_BASE}/demo/advance-workday?campaign_id=demo-campaign-ai-eval`);
    }

    await page.getByRole('button', { name: 'Delivery', exact: true }).click();
    await expect(page.getByText('Campaign Delivery Readiness')).toBeVisible();
    await expect(page.getByText('Mandatory Delivery Gate Checklist')).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('READY').first()).toBeVisible();
    await page.waitForTimeout(2500);

    const delivPath = path.join(OUTPUT_DIR, 'opspilot-delivery.png');
    await page.screenshot({ path: delivPath });

    const resetRes = await page.request.post(`${API_BASE}/demo/reset`);
    expect(resetRes.status()).toBe(200);
  });
});
