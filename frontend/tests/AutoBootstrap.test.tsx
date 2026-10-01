import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TodayPage } from '../src/pages/TodayPage';
import { api, ApiError } from '../src/api/client';

vi.mock('../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/client')>();
  return {
    ...actual,
    api: {
      getTodayCockpit: vi.fn(),
      getAuditLogs: vi.fn(),
      bootstrapDemo: vi.fn(),
      advanceDemoWorkday: vi.fn(),
      resetDemo: vi.fn(),
      getDemoProvenance: vi.fn(),
    },
  };
});

describe('Auto-Bootstrap Flow Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not mutate data on a missing or unavailable backend', async () => {
    // 1. First call to getTodayCockpit returns 404 (uninitialized backend)
    vi.mocked(api.getTodayCockpit)
      .mockRejectedValueOnce(new ApiError('Not Found', 'API_ERROR', 404))
      // 2. Second call after bootstrap returns populated cockpit
      .mockResolvedValueOnce({
        critical_campaigns: [{ campaign_id: 'c1', name: 'Alpha Campaign', sla_status: 'CRITICAL' }],
        at_risk_campaigns: [],
        open_escalations: [],
        unallocated_backlog_summary: [],
        qa_review_backlog_summary: [],
      });

    vi.mocked(api.bootstrapDemo).mockResolvedValueOnce({
      status: 'DEMO_INITIALIZED',
      campaign_id: 'c1',
    });

    vi.mocked(api.getAuditLogs).mockResolvedValue([]);

    render(<TodayPage />);

    expect(await screen.findByText(/Existing data has not been reset/)).toBeInTheDocument();
    expect(api.bootstrapDemo).not.toHaveBeenCalled();
  });

  it('auto-bootstraps when an empty backend returns a successful cockpit response', async () => {
    vi.mocked(api.getTodayCockpit)
      .mockResolvedValueOnce({
        campaign_count: 0,
        critical_campaigns: [],
        at_risk_campaigns: [],
        open_escalations: [],
        unallocated_backlog_summary: [],
        qa_review_backlog_summary: [],
      })
      .mockResolvedValueOnce({
        campaign_count: 1,
        critical_campaigns: [{ campaign_id: 'c1', name: 'Alpha Campaign', sla_status: 'CRITICAL' }],
        at_risk_campaigns: [],
        open_escalations: [],
        unallocated_backlog_summary: [],
        qa_review_backlog_summary: [],
      });
    vi.mocked(api.bootstrapDemo).mockResolvedValueOnce({
      status: 'DEMO_INITIALIZED',
      campaign_id: 'c1',
    });
    vi.mocked(api.getAuditLogs).mockResolvedValue([]);

    render(<TodayPage />);

    await waitFor(() => expect(api.bootstrapDemo).toHaveBeenCalledWith(false));
    expect(await screen.findByText('Alpha Campaign')).toBeInTheDocument();
  });
});
