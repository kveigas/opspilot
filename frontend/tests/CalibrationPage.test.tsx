import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CalibrationPage } from '../src/pages/CalibrationPage';

vi.mock('../src/api/client', () => ({
  api: {
    getCalibrations: vi.fn().mockResolvedValue([
      {
        id: 'cal-1',
        campaign_id: 'c-1',
        domain_tag: 'de',
        total_test_tasks: 10,
        pass_threshold_pct: 90.0,
        max_allowed_attempts: 2,
        status: 'ACTIVE',
        created_at: '2026-08-11T00:00:00Z',
        results: [
          {
            id: 'res-1',
            round_id: 'cal-1',
            worker_id: 'w-1',
            score_pct: 95.0,
            passed: true,
            attempt_number: 1,
            evaluated_at: '2026-08-11T00:00:00Z',
          },
        ],
      },
    ]),
    getCampaigns: vi.fn().mockResolvedValue([]),
    getWorkers: vi.fn().mockResolvedValue([]),
  },
}));

describe('CalibrationPage', () => {
  it('renders calibration round details and results', async () => {
    render(<CalibrationPage />);
    await waitFor(() => {
      expect(screen.getByText(/Domain: de/i)).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('PASSED')).toBeInTheDocument();
    });
  });
});
