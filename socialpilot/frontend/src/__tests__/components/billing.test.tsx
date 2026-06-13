import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/api', () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  return {
    api: { get: mockGet, post: mockPost },
    __esModule: true,
  };
});

import { api } from '@/lib/api';

const MOCK_PLANS = [
  { id: 'free', name: 'Free', price: 0, description: 'Get started', features: ['Basic support'], limits: {}, popular: false },
  { id: 'starter', name: 'Starter', price: 999, description: 'For growing businesses', features: ['Up to 500 leads', 'AI replies'], limits: { leads: 500 }, popular: false },
  { id: 'professional', name: 'Professional', price: 2499, description: 'For serious businesses', features: ['Unlimited leads', 'Priority support'], limits: { leads: 999999 }, popular: true },
  { id: 'agency', name: 'Agency', price: 9999, description: 'For agencies', features: ['Unlimited everything', 'White label'], limits: { leads: 999999 }, popular: false },
];

const MOCK_SUBSCRIPTION = {
  id: 'sub_1', plan: 'starter', status: 'active',
  currentPeriodStart: '2025-01-01T00:00:00Z',
  currentPeriodEnd: '2025-02-01T00:00:00Z',
  canceledAt: null, razorpaySubscriptionId: null,
};

const MOCK_INVOICES = [
  { id: 'inv_1', amount: 99900, currency: 'INR', status: 'paid', plan: 'starter',
    periodStart: '2025-01-01', periodEnd: '2025-02-01', invoiceUrl: null,
    paidAt: '2025-01-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
];

const MOCK_USAGE = {
  plan: 'starter', planName: 'Starter', periodsRemaining: 15,
  metrics: [
    { key: 'leads', label: 'Leads', used: 120, limit: 500, percentage: 24, warning: 'ok' },
    { key: 'comments', label: 'Comments', used: 300, limit: 500, percentage: 60, warning: 'ok' },
  ],
};

async function renderBilling() {
  const mod = await import('@/app/(dashboard)/billing/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('BillingPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows loading skeleton initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderBilling();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders billing header', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_PLANS })
      .mockResolvedValueOnce({ success: true, data: MOCK_SUBSCRIPTION })
      .mockResolvedValueOnce({ success: true, data: MOCK_INVOICES })
      .mockResolvedValueOnce({ success: true, data: MOCK_USAGE });
    await renderBilling();

    await waitFor(() => {
      expect(screen.getByText('Billing & Subscription')).toBeInTheDocument();
    });
  });

  it('displays current plan info', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_PLANS })
      .mockResolvedValueOnce({ success: true, data: MOCK_SUBSCRIPTION })
      .mockResolvedValueOnce({ success: true, data: MOCK_INVOICES })
      .mockResolvedValueOnce({ success: true, data: MOCK_USAGE });
    await renderBilling();

    await waitFor(() => {
      // Plan name is rendered via CSS capitalize: "starter Plan"
      expect(screen.getAllByText(/Plan/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/active/)).toBeInTheDocument();
    });
  });

  it('renders plan cards', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_PLANS })
      .mockResolvedValueOnce({ success: true, data: MOCK_SUBSCRIPTION })
      .mockResolvedValueOnce({ success: true, data: MOCK_INVOICES })
      .mockResolvedValueOnce({ success: true, data: MOCK_USAGE });
    await renderBilling();

    await waitFor(() => {
      expect(screen.getByText('Choose Your Plan')).toBeInTheDocument();
    });

    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('Agency')).toBeInTheDocument();
  });

  it('shows billing history section', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_PLANS })
      .mockResolvedValueOnce({ success: true, data: MOCK_SUBSCRIPTION })
      .mockResolvedValueOnce({ success: true, data: MOCK_INVOICES })
      .mockResolvedValueOnce({ success: true, data: MOCK_USAGE });
    await renderBilling();

    await waitFor(() => {
      expect(screen.getByText('Billing History')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Starter/).length).toBeGreaterThanOrEqual(1);
  });

  it('displays usage metrics', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_PLANS })
      .mockResolvedValueOnce({ success: true, data: MOCK_SUBSCRIPTION })
      .mockResolvedValueOnce({ success: true, data: MOCK_INVOICES })
      .mockResolvedValueOnce({ success: true, data: MOCK_USAGE });
    await renderBilling();

    await waitFor(() => {
      expect(screen.getByText('Usage & Quotas')).toBeInTheDocument();
    });

    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: false });
    await renderBilling();

    await waitFor(() => {
      expect(screen.getByText('Billing & Subscription')).toBeInTheDocument();
    });
  });
});
