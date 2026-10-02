import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QAPage } from '../src/pages/QAPage';

const mocks = vi.hoisted(() => ({
  createEscalation: vi.fn().mockResolvedValue({ id: 'esc-2', status: 'OPEN' }),
  getEscalations: vi.fn().mockResolvedValue([]),
  submitReview: vi.fn().mockResolvedValue({ verdict: 'ACCEPT' }),
  getTasks: vi.fn(),
}));

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Test Campaign', review_sampling_pct: 20, qa_policy: 'ADAPTIVE' }]),
    getWorkers: vi.fn().mockResolvedValue([
      { id: 'w1', name: 'Lead Reviewer', role: 'REVIEWER' },
      { id: 'a1', name: 'Annotator One', role: 'ANNOTATOR' },
    ]),
    getTasks: mocks.getTasks,
    getReviews: vi.fn().mockResolvedValue([]),
    getEscalations: mocks.getEscalations,
    getCampaignQuality: vi.fn().mockResolvedValue({ workers: [{ worker_id: 'a1', tier: 'AT_RISK' }] }),
    createEscalation: mocks.createEscalation,
    sampleSubmittedTasks: vi.fn().mockResolvedValue({ tasks_sent_to_review: 0 }),
    submitReview: mocks.submitReview,
    updateEscalationStatus: vi.fn().mockResolvedValue({ status: 'RESOLVED' }),
  },
}));

describe('QAPage Component', () => {
  beforeEach(() => {
    mocks.submitReview.mockClear();
    mocks.getTasks.mockImplementation(async (_campaign: string, state?: string) =>
      state === 'IN_REVIEW'
        ? [
            { id: 't1', external_reference: 'SYN-1', assigned_worker_id: 'a1', qa_sample_probability: 1, rework_count: 0 },
            { id: 't2', external_reference: 'SYN-2', assigned_worker_id: 'a1', qa_sample_probability: 1, rework_count: 0 },
          ]
        : []);
  });

  it('renders the QA workspace with tabs and the adaptive policy note', async () => {
    render(<QAPage />);
    expect(screen.getByRole('heading', { name: 'QA review & escalations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Review queue/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/weaker annotators’ work is reviewed more often/)).toBeInTheDocument();
  });

  it('explains how to fill an empty queue by hand', async () => {
    mocks.getTasks.mockResolvedValue([]);
    mocks.getTasks.mockClear();
    render(<QAPage />);
    await waitFor(() => expect(mocks.getTasks).toHaveBeenCalledWith('c1', 'IN_REVIEW', 100));
    await waitFor(() => expect(screen.getByText(/Advance workday already reviews the work it samples/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Open Execute' })).toHaveAttribute('href', '#/execution');
    fireEvent.click(screen.getByRole('button', { name: /Sample submitted work/ }));
    expect(await screen.findByText('No submitted work to sample. Submit tasks in Execute first.')).toBeInTheDocument();
  });

  it('shows annotator names and trust tiers instead of raw IDs', async () => {
    render(<QAPage />);
    expect(await screen.findAllByText('Annotator One')).toHaveLength(2);
    expect((await screen.findAllByText('At risk')).length).toBeGreaterThan(0);
  });

  it('accepts the focused task with the keyboard and moves with J', async () => {
    render(<QAPage />);
    await screen.findByText('SYN-2');
    await screen.findByRole('option', { name: 'Lead Reviewer' });
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'a' });
    await waitFor(() => expect(mocks.submitReview).toHaveBeenCalledWith('t2', expect.objectContaining({ verdict: 'ACCEPT', reviewer_id: 'w1' })));
  });

  it('opens the rework form pre-filled from the R shortcut', async () => {
    render(<QAPage />);
    await screen.findByText('SYN-1');
    fireEvent.keyDown(document, { key: 'r' });
    expect(await screen.findByRole('dialog', { name: /QA verdict for SYN-1/ })).toBeVisible();
    expect(screen.getByLabelText('Verdict')).toHaveValue('REWORK');
  });

  it('persists a manual escalation through the API and refreshes the queue', async () => {
    render(<QAPage />);
    await screen.findByRole('option', { name: 'Lead Reviewer' });

    fireEvent.click(screen.getByRole('button', { name: 'New escalation' }));
    fireEvent.change(screen.getByLabelText('Escalation Title'), { target: { value: 'Manual QA escalation' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A persisted escalation created by the manager workflow.' },
    });
    fireEvent.click(screen.getByLabelText('Mark as Operational Blocker'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Escalation' }));

    await waitFor(() => {
      expect(mocks.createEscalation).toHaveBeenCalledWith({
        campaign_id: 'c1',
        title: 'Manual QA escalation',
        description: 'A persisted escalation created by the manager workflow.',
        severity: 'MEDIUM',
        category: 'QUALITY',
        blocker: true,
      });
    });
    expect(await screen.findByText('Escalation created and added to the operational queue.')).toBeInTheDocument();
    expect(mocks.getEscalations.mock.calls.length).toBeGreaterThan(0);
  });
});
