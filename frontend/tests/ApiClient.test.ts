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

describe('safe mutations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const ok = (body: unknown) => ({ ok: true, json: async () => body });
  const headerOf = (call: any[]) => (call[1].headers as Record<string, string>)['Idempotency-Key'];

  it('sends an Idempotency-Key on mutations but not on reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await api.getCampaigns();
    await api.createCampaign({ name: 'x' });
    expect(headerOf(fetchMock.mock.calls[0])).toBeUndefined();
    expect(headerOf(fetchMock.mock.calls[1])).toMatch(/.{8,}/);
  });

  it('retries a mutation after a network failure with the same key', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok({ id: 'review-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = api.submitReview('task-1', { reviewer_id: 'r1', verdict: 'ACCEPT' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ id: 'review-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headerOf(fetchMock.mock.calls[0])).toBe(headerOf(fetchMock.mock.calls[1]));
  });

  it('does not retry a rejected mutation (4xx) and surfaces the server reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, statusText: 'Conflict', json: async () => ({ detail: 'Only unstarted ASSIGNED work can be released.' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.releaseAllocation('alloc-1')).rejects.toThrow('Only unstarted ASSIGNED work can be released.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/allocations/alloc-1/release?reason=MANUAL_RELEASE');
  });

  it('changes task state through PATCH /tasks/{id}/state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ state: 'IN_PROGRESS' }));
    vi.stubGlobal('fetch', fetchMock);
    await api.transitionTaskState('task-9', 'IN_PROGRESS', 'manual');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tasks/task-9/state', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ state: 'IN_PROGRESS', reason: 'manual' }),
    }));
  });

  it('shares one in-flight demo bootstrap between concurrent callers', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const first = api.bootstrapDemo(false);
    const second = api.bootstrapDemo(false);
    resolve(ok({ status: 'DEMO_INITIALIZED' }));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
