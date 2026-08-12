import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../src/App';

const appMocks = vi.hoisted(() => ({
  getTodayCockpit: vi.fn().mockResolvedValue({
    critical_campaigns: [],
    at_risk_campaigns: [],
    open_escalations: [],
    unallocated_backlog_summary: [],
    qa_review_backlog_summary: [],
  }),
  resetDemo: vi.fn().mockResolvedValue({ status: 'DEMO_INITIALIZED' }),
}));

vi.mock('../src/api/client', () => ({
  api: {
    getHealth: vi.fn().mockResolvedValue({ status: 'healthy', phase: 'Phase 4 Public Demo' }),
    getCampaigns: vi.fn().mockResolvedValue([]),
    getWorkers: vi.fn().mockResolvedValue([]),
    getCalibrations: vi.fn().mockResolvedValue([]),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    getAllocations: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
    getTodayCockpit: appMocks.getTodayCockpit,
    resetDemo: appMocks.resetDemo,
    advanceDemoWorkday: vi.fn().mockResolvedValue({ status: 'ON_TRACK' }),
  },
}));

describe('App Component', () => {
  it('renders navbar brand title and phase badge', async () => {
    render(<App />);
    expect(screen.getByText('OpsPilot')).toBeInTheDocument();
    expect(screen.getByText('Phase 4 Public Demo')).toBeInTheDocument();
  });

  it('switches navigation tabs cleanly', async () => {
    render(<App />);

    const campaignsTab = screen.getByRole('button', { name: 'Campaigns' });
    fireEvent.click(campaignsTab);
    expect(screen.getByText('Campaign Intake & Operational Config')).toBeInTheDocument();

    const calibrationTab = screen.getByRole('button', { name: 'Calibration' });
    fireEvent.click(calibrationTab);
    expect(screen.getByText('Calibration & Qualification Engine')).toBeInTheDocument();
  });

  it('refreshes the active page immediately after resetting the demo', async () => {
    render(<App />);
    const callsBeforeReset = appMocks.getTodayCockpit.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));

    await waitFor(() => expect(appMocks.resetDemo).toHaveBeenCalled());
    await waitFor(() => expect(appMocks.getTodayCockpit.mock.calls.length).toBeGreaterThan(callsBeforeReset));
    expect(screen.getByText('Demo reset to the deterministic baseline.')).toBeInTheDocument();
  });
});
