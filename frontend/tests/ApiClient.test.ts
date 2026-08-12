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
});
