import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../src/api/client';

describe('execution API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads execution metrics from the execution endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state_counts: { UNASSIGNED: 800 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.getCampaignExecution('demo-campaign-ai-eval');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/campaigns/demo-campaign-ai-eval/execution',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('samples submitted tasks through the sampling endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks_sent_to_review: 30 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.sampleSubmittedTasks('demo-campaign-ai-eval');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/campaigns/demo-campaign-ai-eval/reviews/sample',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('submits a QA verdict through the review creation contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'review-1', verdict: 'ACCEPT' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.submitReview('task-1', {
      reviewer_id: 'reviewer-1',
      verdict: 'ACCEPT',
      comment: 'Meets quality criteria.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reviews',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          task_id: 'task-1',
          reviewer_id: 'reviewer-1',
          verdict: 'ACCEPT',
          comment: 'Meets quality criteria.',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('allows the deterministic workday advance to complete within its live processing window', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ delivery_status: 'READY' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.advanceDemoWorkday();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/demo/advance-workday',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('creates a manual escalation through the escalation API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'esc-1', status: 'OPEN' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      campaign_id: 'campaign-1',
      title: 'Guideline clarification required',
      description: 'The manager needs an authoritative clarification.',
      severity: 'HIGH',
      category: 'GUIDELINE',
      blocker: true,
    };
    await api.createEscalation(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/escalations',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    );
  });
});
