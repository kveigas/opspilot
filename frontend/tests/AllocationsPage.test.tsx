import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AllocationsPage } from '../src/pages/AllocationsPage';

const mocks = vi.hoisted(() => ({
  releaseAllocation: vi.fn().mockResolvedValue({ status: 'RELEASED' }),
  triggerAllocationRun: vi.fn().mockResolvedValue({
    tasks_allocated: 3, tasks_considered: 4, tasks_unallocated: 1, workers_used: 2, operational_date: '2026-08-11',
    strategy: 'QUALITY_AWARE', created_at: '2026-08-11T09:00:00+00:00', unallocated_reason_counts: { NO_CAPACITY: 1 },
  }),
}));

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([
      { id: 'c1', name: 'Alpha Campaign', task_type: 'TEXT_ANNOTATION', operational_date: '2026-08-11', simulated_clock: true },
    ]),
    getWorkers: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Annotator One' }]),
    getCampaignAllocations: vi.fn().mockResolvedValue([
      { id: 'alloc-1', task_id: 'task-1', worker_id: 'w1', operational_date: '2026-08-11', status: 'ACTIVE',
        reason: 'QUALITY_AWARE: HIGH task routed to TRUSTED annotator' },
    ]),
    getTasks: vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
    releaseAllocation: mocks.releaseAllocation,
    triggerAllocationRun: mocks.triggerAllocationRun,
  },
}));

describe('AllocationsPage Component', () => {
  it('renders the engine with its strategy choice and routing reasons', async () => {
    render(<AllocationsPage />);
    expect(screen.getByText('Task Allocation Engine')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trigger Allocation Run/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Quality-aware/ })).toBeChecked();
    expect(await screen.findByText('QUALITY_AWARE: HIGH task routed to TRUSTED annotator')).toBeInTheDocument();
    expect(await screen.findByText('Annotator One')).toBeInTheDocument();
  });

  it('releases through the allocation endpoint, not a task transition', async () => {
    render(<AllocationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Release task-1' }));
    await waitFor(() => expect(mocks.releaseAllocation).toHaveBeenCalledWith('alloc-1'));
  });

  it('runs allocation with the chosen strategy on the campaign date', async () => {
    render(<AllocationsPage />);
    await screen.findByText('Annotator One');
    fireEvent.click(screen.getByRole('radio', { name: /Balanced/ }));
    fireEvent.click(screen.getByRole('button', { name: /Trigger Allocation Run/ }));
    await waitFor(() => expect(mocks.triggerAllocationRun).toHaveBeenCalledWith({ campaign_id: 'c1', strategy: 'BALANCED' }));
    expect(await screen.findByText(/3 of 4 tasks allocated/)).toBeInTheDocument();
  });
});
