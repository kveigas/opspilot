import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import App from '../src/App';

const appMocks = vi.hoisted(() => ({
  getTodayCockpit: vi.fn().mockResolvedValue({
    campaign_count: 1,
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
    getHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
    getCampaigns: vi.fn().mockResolvedValue([]),
    getWorkers: vi.fn().mockResolvedValue([]),
    getCalibrations: vi.fn().mockResolvedValue([]),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
    getTodayCockpit: appMocks.getTodayCockpit,
    resetDemo: appMocks.resetDemo,
    advanceDemoWorkday: vi.fn().mockResolvedValue({ status: 'ON_TRACK' }),
  },
}));

describe('App Component', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('renders the brand and the guided Today view', async () => {
    render(<App />);
    expect(screen.getByText('OpsPilot')).toBeInTheDocument();
    expect(screen.getByText('Human-data campaign operations')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'What needs your attention' })).toBeInTheDocument();
  });

  it('switches navigation tabs and keeps the route in the URL', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Campaigns' }));
    expect(screen.getByText('Campaign Intake & Operational Config')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/campaigns');

    fireEvent.click(screen.getByRole('button', { name: 'Calibration' }));
    expect(screen.getByText('Calibration & Qualification Engine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calibration' })).toHaveAttribute('aria-current', 'page');
  });

  it('supports keyboard shortcuts for navigation and help', async () => {
    render(<App />);
    fireEvent.keyDown(document, { key: '2' });
    expect(screen.getByText('Campaign Intake & Operational Config')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Shortcuts and glossary' })).toBeVisible();
  });

  it('refreshes the active page immediately after resetting the demo', async () => {
    render(<App />);
    await waitFor(() => expect(appMocks.getTodayCockpit).toHaveBeenCalled());
    const callsBeforeReset = appMocks.getTodayCockpit.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Reset demo/ }));
    expect(screen.getByRole('dialog', { name: 'Reset synthetic demo?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));

    await waitFor(() => expect(appMocks.resetDemo).toHaveBeenCalled());
    await waitFor(() => expect(appMocks.getTodayCockpit.mock.calls.length).toBeGreaterThan(callsBeforeReset));
    expect(screen.getByText('Demo reset to the deterministic baseline.')).toBeInTheDocument();
  });
});
