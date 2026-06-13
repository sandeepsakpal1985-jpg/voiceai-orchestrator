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

async function renderCRM() {
  const mod = await import('@/app/(dashboard)/crm/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('CRMPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderCRM();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders all 8 pipeline stages', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: {} });
    await renderCRM();

    await waitFor(() => {
      expect(screen.getByText('CRM Pipeline')).toBeInTheDocument();
    });

    expect(screen.getByText(/New Lead/)).toBeInTheDocument();
    expect(screen.getByText(/Contacted/)).toBeInTheDocument();
    expect(screen.getByText(/Qualified/)).toBeInTheDocument();
    expect(screen.getByText(/Demo Scheduled/)).toBeInTheDocument();
    expect(screen.getByText(/Proposal Sent/)).toBeInTheDocument();
    expect(screen.getByText(/Negotiation/)).toBeInTheDocument();
    // Won/Lost appear as both stage labels and stat headers; use getAllByText
    expect(screen.getAllByText(/Won/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Lost/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders deals with values and lead names', async () => {
    const mockDeals = {
      contacted: [
        { id: '1', title: 'Deal with Sarah', value: 12000, lead: { name: 'Sarah Johnson', socialHandle: '@sarah_j' } },
      ],
      demo_scheduled: [
        { id: '2', title: 'Deal with Mike', value: 5000, lead: { name: 'Mike Chen', socialHandle: '@mike_chen' } },
      ],
    };

    vi.mocked(api.get).mockResolvedValue({ success: true, data: mockDeals });
    await renderCRM();

    await waitFor(() => {
      expect(screen.getByText('CRM Pipeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Deal with Sarah')).toBeInTheDocument();
    expect(screen.getByText('Deal with Mike')).toBeInTheDocument();
    expect(screen.getByText('$12,000')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
  });

  it('shows Add Deal button', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: {} });
    await renderCRM();

    await waitFor(() => {
      expect(screen.getByText('CRM Pipeline')).toBeInTheDocument();
    });

    expect(screen.getByText('Add Deal')).toBeInTheDocument();
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: false, error: 'Failed' });
    await renderCRM();

    await waitFor(() => {
      expect(screen.getByText('CRM Pipeline')).toBeInTheDocument();
    });
  });
});
