import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExecutionPage } from '../src/pages/ExecutionPage';

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([
      { id: 'c1', name: 'Alpha Campaign', task_type: 'TEXT_ANNOTATION' },
    ]),
    getCampaignExecution: vi.fn().mockResolvedValue({
      campaign_id: 'c1',
      total_tasks: 10,
      completion_pct: 50.0,
      remaining_backlog: 5,
      state_counts: {
        UNASSIGNED: 2,
        ASSIGNED: 2,
        IN_PROGRESS: 1,
        SUBMITTED: 0,
        IN_REVIEW: 0,
        ACCEPTED: 0,
        REWORK_REQUIRED: 0,
        BLOCKED: 0,
        ESCALATED: 0,
        COMPLETED: 5,
      },
      throughput: {
        completed_today: 3,
        completed_last_7_days: 5,
        average_daily_completed_last_7_days: 0.7,
      },
    }),
    getTasks: vi.fn().mockResolvedValue([]),
  },
}));

describe('ExecutionPage Component', () => {
  it('renders execution page header and throughput indicators', async () => {
    render(<ExecutionPage />);
    expect(screen.getByText('Production Execution Operations')).toBeInTheDocument();
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });
});
