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

async function renderLeads() {
  const mod = await import('@/app/(dashboard)/leads/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('LeadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderLeads();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders empty state when no leads', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: [] });
    await renderLeads();

    await waitFor(() => {
      expect(screen.getByText('No leads yet')).toBeInTheDocument();
    });
  });

  it('renders leads with category badges', async () => {
    const mockLeads = [
      {
        id: '1',
        name: 'Sarah Johnson',
        socialHandle: '@sarah_j',
        platform: 'instagram',
        category: 'hot',
        leadScore: 85,
        source: 'comment',
        requirement: 'Looking for bulk pricing',
        tags: ['bulk_buyer'],
        lastContactAt: new Date().toISOString(),
      },
      {
        id: '2',
        name: 'Mike Chen',
        socialHandle: '@mike_chen',
        platform: 'facebook',
        category: 'warm',
        leadScore: 55,
        source: 'dm',
        requirement: 'Interested in demo',
        tags: [],
        lastContactAt: new Date().toISOString(),
      },
    ];

    vi.mocked(api.get).mockResolvedValue({ success: true, data: mockLeads });
    await renderLeads();

    await waitFor(() => {
      expect(screen.getByText('Leads')).toBeInTheDocument();
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.getByText('Mike Chen')).toBeInTheDocument();
    });

    expect(screen.getByText('HOT')).toBeInTheDocument();
    expect(screen.getByText('WARM')).toBeInTheDocument();
  });

  it('shows lead score and tags', async () => {
    const mockLeads = [
      {
        id: '1',
        name: 'VIP Customer',
        socialHandle: '@vip_customer',
        platform: 'instagram',
        category: 'vip',
        leadScore: 92,
        source: 'dm',
        requirement: 'Looking for white-label solution',
        tags: ['vip_customer', 'bulk_buyer'],
        lastContactAt: new Date().toISOString(),
      },
    ];

    vi.mocked(api.get).mockResolvedValue({ success: true, data: mockLeads });
    await renderLeads();

    await waitFor(() => {
      expect(screen.getByText('VIP Customer')).toBeInTheDocument();
      // "VIP" appears in both the category filter button and the category badge
      const vipElements = screen.getAllByText('VIP');
      expect(vipElements.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('Score: 92')).toBeInTheDocument();
    // Tags are rendered with underscores replaced by spaces
    const tagElements = screen.getAllByText('vip customer');
    expect(tagElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('bulk buyer')).toBeInTheDocument();
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: false, error: 'Failed' });
    await renderLeads();

    await waitFor(() => {
      expect(screen.getByText('Leads')).toBeInTheDocument();
    });

    expect(screen.getByText('No leads yet')).toBeInTheDocument();
  });
});
