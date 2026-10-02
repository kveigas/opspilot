import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExecutionPage } from '../src/pages/ExecutionPage';
import { api } from '../src/api/client';

const mocks = vi.hoisted(() => ({ transitionTaskState: vi.fn().mockResolvedValue({ state: 'IN_PROGRESS' }) }));

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([
      { id: 'c1', name: 'Alpha Campaign', task_type: 'TEXT_ANNOTATION' },
    ]),
    getWorkers: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Annotator One' }]),
    getCampaignExecution: vi.fn().mockResolvedValue({
      campaign_id: 'c1',
      total_tasks: 10,
      completion_pct: 50.0,
      remaining_backlog: 5,
      state_counts: {
        UNASSIGNED: 2, ASSIGNED: 2, IN_PROGRESS: 1, SUBMITTED: 0, IN_REVIEW: 0,
        ACCEPTED: 0, REWORK_REQUIRED: 0, BLOCKED: 0, ESCALATED: 0, COMPLETED: 5,
      },
      throughput: { completed_today: 3, completed_last_7_days: 5, average_daily_completed_last_7_days: 0.7 },
    }),
    getTasks: vi.fn().mockResolvedValue([
      { id: 'task-1', external_reference: 'SYN-0001', priority: 'HIGH', state: 'ASSIGNED', assigned_worker_id: 'w1', rework_count: 0 },
    ]),
    transitionTaskState: mocks.transitionTaskState,
  },
}));

describe('ExecutionPage Component', () => {
  it('renders the pipeline and throughput indicators', async () => {
    render(<ExecutionPage />);
    expect(screen.getByRole('heading', { name: 'Production execution' })).toBeInTheDocument();
    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(await screen.findByText('Annotator One')).toBeInTheDocument();
  });

  it('labels the day basis of throughput', async () => {
    vi.mocked(api.getCampaignExecution).mockResolvedValueOnce({
      campaign_id: 'c1', total_tasks: 10, completion_pct: 50.0, remaining_backlog: 5, state_counts: { COMPLETED: 5 },
      throughput: { completed_today: 0, completed_last_7_days: 5, average_daily_completed_last_7_days: 0.7, reference_date: '2026-08-12', simulated_clock: true },
    });
    render(<ExecutionPage />);
    expect(await screen.findByText(/Days follow the simulated clock/)).toBeInTheDocument();
  });

  it('keeps the newest filter result when an older reload lands last', async () => {
    let releaseOld: (rows: any[]) => void = () => {};
    const getTasks = vi.mocked(api.getTasks);
    getTasks.mockClear();
    getTasks
      .mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; }))  // initial "All states" load, slow
      .mockResolvedValueOnce([{ id: 'p1', external_reference: 'SYN-NEW', priority: 'HIGH', state: 'IN_PROGRESS', assigned_worker_id: 'w1', rework_count: 0 }]);
    render(<ExecutionPage />);
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'IN_PROGRESS' } });
    expect(await screen.findByText('SYN-NEW')).toBeInTheDocument();
    releaseOld([{ id: 'a1', external_reference: 'SYN-OLD', priority: 'HIGH', state: 'ASSIGNED', assigned_worker_id: 'w1', rework_count: 0 }]);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('SYN-OLD')).not.toBeInTheDocument();
    expect(screen.getByText('SYN-NEW')).toBeInTheDocument();
  });

  it('starts a task through the real state endpoint contract', async () => {
    render(<ExecutionPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start SYN-0001' }));
    await waitFor(() => expect(mocks.transitionTaskState).toHaveBeenCalledWith('task-1', 'IN_PROGRESS', expect.any(String)));
    expect(await screen.findByText(/SYN-0001 moved to in progress/)).toBeInTheDocument();
  });
});
