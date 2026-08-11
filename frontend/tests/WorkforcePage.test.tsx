import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkforcePage } from '../src/pages/WorkforcePage';

vi.mock('../src/api/client', () => ({
  api: {
    getWorkers: vi.fn().mockResolvedValue([
      {
        id: 'w-1',
        name: 'Anna Weber',
        email: 'anna.weber@example.com',
        role: 'ANNOTATOR',
        timezone: 'UTC',
        default_max_daily_capacity: 35,
        availability: 'AVAILABLE',
        is_active: true,
        skills: ['de', 'rlhf'],
        qualifications: [],
        created_at: '2026-08-11T00:00:00Z',
      },
    ]),
    createWorker: vi.fn().mockResolvedValue({}),
    getCapacity: vi.fn().mockResolvedValue({
      id: 'cap-1',
      worker_id: 'w-1',
      capacity_date: '2026-08-12',
      max_daily_capacity: 35,
      allocated_for_date: 0,
      remaining_capacity_for_date: 35,
    }),
  },
}));

describe('WorkforcePage', () => {
  it('renders worker roster table', async () => {
    render(<WorkforcePage />);
    await waitFor(() => {
      expect(screen.getByText('Anna Weber')).toBeInTheDocument();
      expect(screen.getByText('anna.weber@example.com')).toBeInTheDocument();
      expect(screen.getByText('35/day')).toBeInTheDocument();
    });
  });
});
