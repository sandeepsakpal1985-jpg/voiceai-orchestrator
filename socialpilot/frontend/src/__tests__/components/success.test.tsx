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

const MOCK_SUCCESS = {
  successScore: 82,
  scoreBreakdown: [
    { key: 'responseRate', label: 'Response Rate', score: 85, maxScore: 100, weight: '25%', description: 'How quickly you respond' },
    { key: 'leadCapture', label: 'Lead Capture', score: 78, maxScore: 100, weight: '25%', description: 'Leads captured from interactions' },
    { key: 'engagement', label: 'Engagement', score: 90, maxScore: 100, weight: '25%', description: 'User engagement rate' },
    { key: 'revenue', label: 'Revenue', score: 75, maxScore: 100, weight: '25%', description: 'Revenue generated' },
  ],
  summary: 'Your AI agent is performing well. Reply rates are high and revenue is growing.',
  milestones: [
    { key: 'm1', label: '100 Leads Captured', achieved: true, achievedAt: '2025-01-10T00:00:00Z', icon: 'users' },
    { key: 'm2', label: 'First Deal Closed', achieved: true, achievedAt: '2025-01-12T00:00:00Z', icon: 'trophy' },
    { key: 'm3', label: '₹50k Revenue', achieved: false, icon: 'dollar-sign' },
  ],
  recommendations: [
    { priority: 'high', category: 'setup', message: 'Upload your full catalog for better responses', actionLabel: 'Add Products', actionLink: '/knowledge' },
    { priority: 'medium', category: 'engagement', message: 'Personalize your welcome message', actionLabel: 'Edit Greeting', actionLink: '/settings' },
  ],
  trends: [
    { key: 'leads', label: 'Leads Captured', current: 45, previous: 32, direction: 'up' },
    { key: 'revenue', label: 'Revenue Generated', current: 15000, previous: 12000, direction: 'up' },
  ],
  metrics: {
    commentReplyRate: 94, hotLeads: 8, totalRevenue: 250000, pendingApprovals: 3,
    totalLeads: 120, totalComments: 450, totalDms: 230, wonDeals: 15,
    aiRevenue: 180000, openEscalations: 1, openMissed: 2, dmResolveRate: 88,
  },
};

async function renderSuccess() {
  const mod = await import('@/app/(dashboard)/success/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('SuccessPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows loading spinner initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderSuccess();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders header', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_SUCCESS });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText('Customer Success')).toBeInTheDocument();
    });
  });

  it('displays success summary', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_SUCCESS });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText(/AI agent is performing well/)).toBeInTheDocument();
    });
  });

  it('renders quick metric cards', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_SUCCESS });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText('94%')).toBeInTheDocument();
      expect(screen.getByText('Reply Rate')).toBeInTheDocument();
    });

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Hot Leads')).toBeInTheDocument();
  });

  it('shows weekly trends', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_SUCCESS });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText('Leads Captured')).toBeInTheDocument();
      expect(screen.getByText('Revenue Generated')).toBeInTheDocument();
    });
  });

  it('renders recommendations section', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_SUCCESS });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText(/Upload your full catalog/)).toBeInTheDocument();
    });
  });

  it('renders all metrics grid', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_SUCCESS });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText('All Metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('Deals Won')).toBeInTheDocument();
    expect(screen.getByText('Open Escalations')).toBeInTheDocument();
  });

  it('handles null data gracefully', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: false });
    await renderSuccess();

    await waitFor(() => {
      expect(screen.getByText(/Unable to load success dashboard/)).toBeInTheDocument();
    });
  });
});
