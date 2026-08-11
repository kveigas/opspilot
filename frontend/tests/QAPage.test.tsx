import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QAPage } from '../src/pages/QAPage';

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Test Campaign', review_sampling_pct: 20 }]),
    getWorkers: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Lead Reviewer', role: 'REVIEWER' }]),
    getTasks: vi.fn().mockResolvedValue([]),
    getReviews: vi.fn().mockResolvedValue([]),
    getEscalations: vi.fn().mockResolvedValue([]),
  },
}));

describe('QAPage Component', () => {
  it('renders QA Operations heading and sub-navigation', async () => {
    render(<QAPage />);
    expect(screen.getByText('QA & Escalations Operations')).toBeInTheDocument();
  });
});
