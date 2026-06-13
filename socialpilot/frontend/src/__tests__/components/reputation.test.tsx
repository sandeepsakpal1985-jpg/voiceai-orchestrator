import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/api', () => {
  const mockGet = vi.fn();
  return {
    api: { get: mockGet },
    __esModule: true,
  };
});

import { api } from '@/lib/api';

const MOCK_REPUTATION = {
  reputationScore: 72,
  trend: 5,
  positivePercent: 65, positive: 450,
  neutralPercent: 25, neutral: 180,
  negativePercent: 10, negative: 70,
  crisis: 0,
  totalInteractions: 700, activeAlerts: 2, openEscalations: 1,
  recentAlerts: [
    { id: 'a1', severity: 'high', reason: 'Negative sentiment spike', context: 'Multiple complaints about shipping delays', createdAt: '2025-01-15T10:00:00Z' },
  ],
};

async function renderReputation() {
  const mod = await import('@/app/(dashboard)/reputation/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('ReputationPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows loading skeletons initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderReputation();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders header', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_REPUTATION });
    await renderReputation();

    await waitFor(() => {
      expect(screen.getByText('Reputation Dashboard')).toBeInTheDocument();
    });
  });

  it('displays reputation score', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_REPUTATION });
    await renderReputation();

    await waitFor(() => {
      const scores = screen.getAllByText('72');
      expect(scores.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Reputation Score/)).toBeInTheDocument();
  });

  it('shows sentiment breakdown cards', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_REPUTATION });
    await renderReputation();

    await waitFor(() => {
      expect(screen.getByText('Positive')).toBeInTheDocument();
      expect(screen.getByText('Neutral')).toBeInTheDocument();
      expect(screen.getAllByText('Negative').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders summary metric cards', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_REPUTATION });
    await renderReputation();

    await waitFor(() => {
      expect(screen.getByText('Total Interactions')).toBeInTheDocument();
      expect(screen.getByText('Active Alerts')).toBeInTheDocument();
    });
  });

  it('shows active reputation alerts', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_REPUTATION });
    await renderReputation();

    await waitFor(() => {
      expect(screen.getByText(/Negative sentiment spike/)).toBeInTheDocument();
    });
  });

  it('renders trend badge', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_REPUTATION });
    await renderReputation();

    await waitFor(() => {
      expect(screen.getByText('+5')).toBeInTheDocument();
    });
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: false });
    await renderReputation();

    await waitFor(() => {
      expect(screen.getByText('Reputation Dashboard')).toBeInTheDocument();
    });
  });
});
