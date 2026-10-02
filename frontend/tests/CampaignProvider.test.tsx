import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { CampaignProvider, useCampaigns } from '../src/state/CampaignContext';
import { api, ApiError } from '../src/api/client';

vi.mock('../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/client')>();
  return { ...actual, api: { getCampaigns: vi.fn(), bootstrapDemo: vi.fn() } };
});

const DEMO = { id: 'demo-campaign-ai-eval', name: 'Demo', simulated_clock: true };

// Stands in for any page: records every campaign id it is handed.
const seen: string[] = [];
const Probe: React.FC = () => {
  const { selectedId } = useCampaigns();
  seen.push(selectedId);
  return <p>selected:{selectedId || 'none'}</p>;
};

describe('CampaignProvider demo seeding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    seen.length = 0;
    window.localStorage.clear();
  });

  it('seeds the demo from any page when a restarted server is empty', async () => {
    window.localStorage.setItem('opspilot.selectedCampaign', DEMO.id); // a returning visitor
    vi.mocked(api.getCampaigns).mockResolvedValueOnce([]).mockResolvedValueOnce([DEMO]);
    vi.mocked(api.bootstrapDemo).mockResolvedValueOnce({ status: 'DEMO_INITIALIZED' });

    render(<CampaignProvider><Probe /></CampaignProvider>);

    expect(await screen.findByText(`selected:${DEMO.id}`)).toBeInTheDocument();
    expect(api.bootstrapDemo).toHaveBeenCalledWith(false);
    // The saved id was not handed to pages before the campaign existed.
    expect(seen.slice(0, seen.indexOf(DEMO.id))).toEqual(seen.slice(0, seen.indexOf(DEMO.id)).map(() => ''));
  });

  it('never seeds after an error or when campaigns exist', async () => {
    vi.mocked(api.getCampaigns).mockRejectedValueOnce(new ApiError('down', 'NETWORK_UNAVAILABLE'));
    const { unmount } = render(<CampaignProvider><Probe /></CampaignProvider>);
    await waitFor(() => expect(api.getCampaigns).toHaveBeenCalledTimes(1));
    unmount();

    vi.mocked(api.getCampaigns).mockResolvedValueOnce([DEMO]);
    render(<CampaignProvider><Probe /></CampaignProvider>);
    expect(await screen.findByText(`selected:${DEMO.id}`)).toBeInTheDocument();
    expect(api.bootstrapDemo).not.toHaveBeenCalled();
  });
});
