import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QAPage } from '../src/pages/QAPage';

const mocks = vi.hoisted(() => ({
  createEscalation: vi.fn().mockResolvedValue({ id: 'esc-2', status: 'OPEN' }),
  getEscalations: vi.fn().mockResolvedValue([]),
}));

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Test Campaign', review_sampling_pct: 20 }]),
    getWorkers: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Lead Reviewer', role: 'REVIEWER' }]),
    getTasks: vi.fn().mockResolvedValue([]),
    getReviews: vi.fn().mockResolvedValue([]),
    getEscalations: mocks.getEscalations,
    createEscalation: mocks.createEscalation,
    sampleSubmittedTasks: vi.fn().mockResolvedValue({ tasks_sent_to_review: 0 }),
    submitReview: vi.fn().mockResolvedValue({ verdict: 'ACCEPT' }),
    updateEscalationStatus: vi.fn().mockResolvedValue({ status: 'RESOLVED' }),
  },
}));

describe('QAPage Component', () => {
  it('renders QA Operations heading and sub-navigation', () => {
    render(<QAPage />);
    expect(screen.getByText('QA & Escalations Operations')).toBeInTheDocument();
  });

  it('persists a manual escalation through the API and refreshes the queue', async () => {
    render(<QAPage />);
    await screen.findByRole('option', { name: /Test Campaign/ });

    fireEvent.click(screen.getByRole('button', { name: '+ Create Escalation' }));
    fireEvent.change(screen.getByLabelText('Escalation Title'), { target: { value: 'Manual QA escalation' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A persisted escalation created by the manager workflow.' },
    });
    fireEvent.click(screen.getByLabelText('Mark as Operational Blocker'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Escalation', exact: true }));

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
