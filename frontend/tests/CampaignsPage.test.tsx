import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CampaignsPage } from '../src/pages/CampaignsPage';

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([
      {
        id: 'c-1',
        name: 'German Multilingual RLHF',
        client_name: 'AI Ops Client',
        task_type: 'TEXT_ANNOTATION',
        total_volume: 2000,
        target_quality_pct: 95.0,
        review_sampling_pct: 20.0,
        target_daily_throughput: 200,
        start_date: '2026-08-10',
        due_date: '2026-08-25',
        priority: 'HIGH',
        status: 'ACTIVE',
        calibration_required: true,
        required_annotators: 5,
        required_reviewers: 1,
        required_skills: ['de', 'rlhf'],
        created_at: '2026-08-11T00:00:00Z',
        updated_at: '2026-08-11T00:00:00Z',
      },
    ]),
    createCampaign: vi.fn().mockResolvedValue({}),
  },
}));

describe('CampaignsPage', () => {
  it('renders campaigns table with data', async () => {
    render(<CampaignsPage />);
    await waitFor(() => {
      expect(screen.getByText('German Multilingual RLHF')).toBeInTheDocument();
      expect(screen.getByText('AI Ops Client')).toBeInTheDocument();
      expect(screen.getByText('2,000 tasks')).toBeInTheDocument();
    });
  });

  it('opens creation modal when button clicked', async () => {
    render(<CampaignsPage />);
    const createBtn = screen.getByRole('button', { name: /create campaign/i });
    fireEvent.click(createBtn);
    expect(screen.getByText('Create New Campaign')).toBeInTheDocument();
  });
});
