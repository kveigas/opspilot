import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AllocationsPage } from '../src/pages/AllocationsPage';

vi.mock('../src/api/client', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([
      { id: 'c1', name: 'Alpha Campaign', task_type: 'TEXT_ANNOTATION' },
    ]),
    getAllocations: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
  },
}));

describe('AllocationsPage Component', () => {
  it('renders allocation page header and trigger button', async () => {
    render(<AllocationsPage />);
    expect(screen.getByText('Task Allocation Engine')).toBeInTheDocument();
    expect(screen.getByText('⚡ Trigger Allocation Run')).toBeInTheDocument();
  });
});
