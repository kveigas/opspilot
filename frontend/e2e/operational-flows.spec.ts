import { test, expect } from '@playwright/test';

test.describe('Phase 3 Operational Control E2E Flows', () => {

  test('FLOW 1: campaign -> worker -> calibration -> tasks -> allocation -> execute -> review -> accept', async ({ request, page }) => {
    // 1. Create Campaign
    const campRes = await request.post('/api/v1/campaigns', {
      data: {
        name: `E2E Flow 1 ${Date.now()}`,
        client_name: 'Flow1 Client',
        task_type: 'TEXT_ANNOTATION',
        total_volume: 10,
        target_daily_throughput: 10,
        start_date: '2026-08-10',
        due_date: '2026-08-20',
        calibration_required: false,
        skills: ['en'],
      },
    });
    expect(campRes.ok()).toBeTruthy();
    const campaign = await campRes.json();

    // 2. Create Annotator and Reviewer Workers
    const w1Res = await request.post('/api/v1/workers', {
      data: {
        name: `Flow1 Annotator ${Date.now()}`,
        email: `ann_${Date.now()}@flow1.com`,
        role: 'ANNOTATOR',
        default_max_daily_capacity: 10,
        skills: ['en'],
      },
    });
    expect(w1Res.ok()).toBeTruthy();

    const w2Res = await request.post('/api/v1/workers', {
      data: {
        name: `Flow1 Reviewer ${Date.now()}`,
        email: `rev_${Date.now()}@flow1.com`,
        role: 'REVIEWER',
        default_max_daily_capacity: 10,
        skills: ['en'],
      },
    });
    const reviewer = await w2Res.json();

    // 3. Create Task Batch
    const taskRes = await request.post(`/api/v1/campaigns/${campaign.id}/tasks`, {
      data: { count: 5, required_skill_tags: ['en'] },
    });
    expect(taskRes.ok()).toBeTruthy();

    // 4. Trigger Allocation Engine
    const allocRes = await request.post('/api/v1/allocations/trigger', {
      data: { campaign_id: campaign.id, operational_date: '2026-08-11', max_tasks_to_allocate: 5 },
    });
    expect(allocRes.ok()).toBeTruthy();

    // 5. Execute Tasks (ASSIGNED -> IN_PROGRESS -> SUBMITTED)
    const tasksRes = await request.get(`/api/v1/tasks?campaign_id=${campaign.id}`);
    const tasks = await tasksRes.json();
    const task = tasks[0];

    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'IN_PROGRESS' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'SUBMITTED' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'IN_REVIEW' } });

    // 6. Review & Accept
    const revRes = await request.post('/api/v1/reviews', {
      data: { task_id: task.id, reviewer_id: reviewer.id, verdict: 'ACCEPT' },
    });
    expect(revRes.ok()).toBeTruthy();

    // Verify task completed in UI
    await page.goto('/');
    await page.getByRole('button', { name: 'Execution', exact: true }).click();
    await expect(page.getByText('Production Execution Operations')).toBeVisible();
  });

  test('FLOW 2: submit -> review -> rework -> resubmit -> accept', async ({ request }) => {
    // Setup campaign & workers
    const campRes = await request.post('/api/v1/campaigns', {
      data: {
        name: `E2E Flow 2 ${Date.now()}`,
        client_name: 'Flow2 Client',
        task_type: 'TEXT_ANNOTATION',
        total_volume: 5,
        target_daily_throughput: 5,
        start_date: '2026-08-10',
        due_date: '2026-08-20',
        calibration_required: false,
      },
    });
    const campaign = await campRes.json();

    await request.post('/api/v1/workers', {
      data: { name: 'Flow2 Ann', email: `ann_${Date.now()}@f2.com`, role: 'ANNOTATOR' },
    });

    const reviewer = await (await request.post('/api/v1/workers', {
      data: { name: 'Flow2 Rev', email: `rev_${Date.now()}@f2.com`, role: 'REVIEWER' },
    })).json();

    await request.post(`/api/v1/campaigns/${campaign.id}/tasks`, { data: { count: 1 } });
    const tasks = await (await request.get(`/api/v1/tasks?campaign_id=${campaign.id}`)).json();
    const task = tasks[0];

    // Transition to IN_REVIEW
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'ASSIGNED' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'IN_PROGRESS' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'SUBMITTED' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'IN_REVIEW' } });

    // Step 1: Review REWORK
    const rw1 = await request.post('/api/v1/reviews', {
      data: { task_id: task.id, reviewer_id: reviewer.id, verdict: 'REWORK', reason_code: 'LABEL_ERROR' },
    });
    expect(rw1.ok()).toBeTruthy();

    const tAfterRw = await (await request.get(`/api/v1/tasks/${task.id}`)).json();
    expect(tAfterRw.rework_count).toBe(1);
    expect(tAfterRw.state).toBe('ASSIGNED');

    // Step 2: Resubmit task
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'IN_PROGRESS' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'SUBMITTED' } });
    await request.patch(`/api/v1/tasks/${task.id}/state`, { data: { state: 'IN_REVIEW' } });

    // Step 3: Accept task
    const acceptRes = await request.post('/api/v1/reviews', {
      data: { task_id: task.id, reviewer_id: reviewer.id, verdict: 'ACCEPT' },
    });
    expect(acceptRes.ok()).toBeTruthy();

    const tFinal = await (await request.get(`/api/v1/tasks/${task.id}`)).json();
    expect(tFinal.state).toBe('COMPLETED');
  });

  test('FLOW 3: escalation -> SLA state impact -> resolution -> SLA recomputation', async ({ request }) => {
    const campRes = await request.post('/api/v1/campaigns', {
      data: {
        name: `E2E Flow 3 ${Date.now()}`,
        client_name: 'Flow3 Client',
        task_type: 'TEXT_ANNOTATION',
        total_volume: 20,
        target_daily_throughput: 5,
        start_date: '2026-08-10',
        due_date: '2026-08-20',
        calibration_required: false,
      },
    });
    const campaign = await campRes.json();

    // Initial SLA
    const sla1 = await (await request.get(`/api/v1/campaigns/${campaign.id}/sla`)).json();
    expect(sla1.open_critical_escalations).toBe(0);

    // Create CRITICAL Escalation
    const escRes = await request.post('/api/v1/escalations', {
      data: {
        campaign_id: campaign.id,
        title: 'Critical tool blocker',
        description: 'Annotation tool offline',
        severity: 'CRITICAL',
        category: 'TOOLING',
      },
    });
    const esc = await escRes.json();

    // SLA should become CRITICAL with CRITICAL_ESCALATION_OPEN reason
    const sla2 = await (await request.get(`/api/v1/campaigns/${campaign.id}/sla`)).json();
    expect(sla2.status).toBe('CRITICAL');
    expect(sla2.reason_codes).toContain('CRITICAL_ESCALATION_OPEN');

    // Resolve Escalation
    await request.patch(`/api/v1/escalations/${esc.id}/status`, {
      data: { status: 'RESOLVED', resolution: 'Tooling restored' },
    });

    // Recomputed SLA no longer contains CRITICAL_ESCALATION_OPEN
    const sla3 = await (await request.get(`/api/v1/campaigns/${campaign.id}/sla`)).json();
    expect(sla3.reason_codes).not.toContain('CRITICAL_ESCALATION_OPEN');
  });

  test('FLOW 4: delivery NOT_READY -> resolve blocking condition -> readiness changes', async ({ request, page }) => {
    const campRes = await request.post('/api/v1/campaigns', {
      data: {
        name: `E2E Flow 4 ${Date.now()}`,
        client_name: 'Flow4 Client',
        task_type: 'TEXT_ANNOTATION',
        total_volume: 2,
        target_daily_throughput: 2,
        start_date: '2026-08-10',
        due_date: '2026-08-20',
        review_sampling_pct: 0.0,
      },
    });
    const campaign = await campRes.json();

    // Create 2 tasks
    await request.post(`/api/v1/campaigns/${campaign.id}/tasks`, { data: { count: 2 } });
    const tasks = await (await request.get(`/api/v1/tasks?campaign_id=${campaign.id}`)).json();

    // 1. Delivery initial state -> NOT_READY (Volume incomplete)
    const deliv1 = await (await request.get(`/api/v1/campaigns/${campaign.id}/delivery-readiness`)).json();
    expect(deliv1.status).toBe('NOT_READY');

    // 2. Resolve blocking condition (complete both tasks)
    for (const t of tasks) {
      await request.patch(`/api/v1/tasks/${t.id}/state`, { data: { state: 'ASSIGNED' } });
      await request.patch(`/api/v1/tasks/${t.id}/state`, { data: { state: 'IN_PROGRESS' } });
      await request.patch(`/api/v1/tasks/${t.id}/state`, { data: { state: 'SUBMITTED' } });
      await request.patch(`/api/v1/tasks/${t.id}/state`, { data: { state: 'ACCEPTED' } });
      await request.patch(`/api/v1/tasks/${t.id}/state`, { data: { state: 'COMPLETED' } });
    }

    // 3. Re-evaluate delivery -> READY
    const deliv2 = await (await request.get(`/api/v1/campaigns/${campaign.id}/delivery-readiness`)).json();
    expect(deliv2.status).toBe('READY');

    // Verify UI view
    await page.goto('/');
    await page.getByRole('button', { name: 'Delivery', exact: true }).click();
    await expect(page.getByText('Campaign Delivery Readiness')).toBeVisible();
  });
});
