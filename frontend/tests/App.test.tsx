import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../src/App';

vi.mock('../src/api/client', () => ({
  api: {
    getHealth: vi.fn().mockResolvedValue({ status: 'healthy', phase: 'Phase 4 Public Demo' }),
    getCampaigns: vi.fn().mockResolvedValue([]),
    getWorkers: vi.fn().mockResolvedValue([]),
    getCalibrations: vi.fn().mockResolvedValue([]),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    getAllocations: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
    getTodayCockpit: vi.fn().mockResolvedValue({
      critical_campaigns: [],
      at_risk_campaigns: [],
      critical_escalations: [],
      review_backlogs: [],
      blocked_work: [],
      rework_items: [],
      delivery_candidates: [],
    }),
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
});
