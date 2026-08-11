import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeliveryPage } from '../src/pages/DeliveryPage';

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Test Campaign', task_type: 'TEXT' }]),
    getDeliveryReadiness: vi.fn().mockResolvedValue({
      campaign_id: 'c1',
      status: 'READY',
      evaluated_at: new Date().toISOString(),
      gates: [
        { gate: 'VOLUME_COMPLETE', passed: true, reason: 'Completed 50/50', evidence: '50/50' },
        { gate: 'REVIEW_REQUIREMENT_COMPLETE', passed: true, reason: 'Reviewed 10/10', evidence: '10/10' },
      ],
      warnings: [],
      blocking_reasons: [],
    }),
  },
}));

describe('DeliveryPage Component', () => {
  it('renders Campaign Delivery Readiness heading', async () => {
    render(<DeliveryPage />);
    expect(screen.getByText('Campaign Delivery Readiness')).toBeInTheDocument();
  });
});
