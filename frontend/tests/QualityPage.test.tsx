import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QualityPage } from '../src/pages/QualityPage';

const report = {
  campaign_id: 'c1',
  qa_policy: 'ADAPTIVE',
  target_quality_pct: 95,
  base_sampling_pct: 20,
  tier_sampling_pct: { TRUSTED: 5, STANDARD: 20, PROBATION: 50, AT_RISK: 100 },
  tier_explanations: { TRUSTED: 'Strong record.', STANDARD: 'Mixed.', PROBATION: 'New.', AT_RISK: 'Likely below target.' },
  tier_counts: { TRUSTED: 1, AT_RISK: 1 },
  workers: [
    { worker_id: 'w1', worker_name: 'Annotator One', tier: 'TRUSTED', reviews: 36, accepted: 36, rejected: 0, posterior_mean: 0.974, lower_90: 0.92, upper_90: 0.999, prob_meets_target: 0.85, sampling_rate: 0.05 },
    { worker_id: 'w9', worker_name: 'Annotator Nine', tier: 'AT_RISK', reviews: 36, accepted: 27, rejected: 9, posterior_mean: 0.737, lower_90: 0.61, upper_90: 0.85, prob_meets_target: 0, sampling_rate: 1 },
  ],
  first_pass_quality: { estimate: 0.9386, lower_90: 0.912, upper_90: 0.956, reviews: 324, effective_sample_size: 324, unweighted_rate: 0.938 },
  residual_error: { completed_tasks: 600, unreviewed_completed_tasks: 276, expected_undetected_errors: 23.2, estimated_residual_error_rate: 0.0387, estimated_delivered_accuracy: 0.9613 },
  review_effort: { tasks_through_sampling: 0, expected_reviews_under_policy: 0, expected_reviews_under_flat_policy: 0, review_effort_ratio: null, tasks_by_sampling_tier: {} },
  method: ['Beta(1,1) prior per annotator.'],
};

const mocks = vi.hoisted(() => ({ updateCampaign: vi.fn().mockResolvedValue({}) }));

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Demo campaign', qa_policy: 'ADAPTIVE' }]),
    getCampaignQuality: vi.fn().mockImplementation(async () => report),
    getCampaignForecast: vi.fn().mockResolvedValue({
      status: 'FORECAST', operational_date: '2026-08-11', due_date: '2026-08-20', p50_date: '2026-08-14', p90_date: '2026-08-17',
      probability_on_time: 0.97, remaining_tasks: 1400, daily_capacity: 1360, simulations: 2000,
      assumptions: ['Daily capacity 1360 tasks.', 'Weekends excluded.'],
    }),
    updateCampaign: mocks.updateCampaign,
  },
}));

describe('QualityPage', () => {
  it('explains delivered accuracy, trust tiers and the forecast', async () => {
    render(<QualityPage />);
    expect(await screen.findByText('96.1%')).toBeInTheDocument();
    expect(screen.getByText('Annotator Nine')).toBeInTheDocument();
    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Estimated accuracy 73.7%, 90% interval 61.0% to 85.0%/ })).toBeInTheDocument();
    expect(screen.getByText('Weekends excluded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adaptive' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches the QA policy through the campaign API', async () => {
    render(<QualityPage />);
    await screen.findByText('96.1%');
    fireEvent.click(screen.getByRole('button', { name: 'Flat' }));
    await waitFor(() => expect(mocks.updateCampaign).toHaveBeenCalledWith('c1', { qa_policy: 'FLAT' }));
  });
});
