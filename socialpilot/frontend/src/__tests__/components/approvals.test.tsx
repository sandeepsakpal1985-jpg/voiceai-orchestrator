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

vi.mock('@/lib/use-websocket', () => ({
  useWebSocket: vi.fn(),
  __esModule: true,
}));

import { api } from '@/lib/api';

const MOCK_ITEMS = [
  {
    id: '1',
    status: 'pending',
    platform: 'instagram',
    customerName: 'Sarah J',
    confidenceScore: 0.87,
    originalMessage: 'How much does this cost?',
    draftContent: 'Hi! Our pricing starts at ₹999/month.',
    createdAt: '2025-01-15T10:00:00Z',
  },
  {
    id: '2',
    status: 'pending',
    platform: 'facebook',
    customerName: 'Mike C',
    confidenceScore: 0.45,
    originalMessage: 'Is this available?',
    draftContent: 'Yes, we serve all major cities!',
    createdAt: '2025-01-15T11:00:00Z',
  },
];

const MOCK_STATS = { total: 10, pending: 3, approved: 5, rejected: 2, approvalRate: 71 };

async function renderApprovals() {
  const mod = await import('@/app/(dashboard)/approvals/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('ApprovalsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows loading skeletons initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderApprovals();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders header and filter tabs', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_ITEMS })
      .mockResolvedValueOnce({ success: true, data: MOCK_STATS });
    await renderApprovals();

    await waitFor(() => {
      expect(screen.getByText('Approvals Queue')).toBeInTheDocument();
    });

    // Filter tabs — some labels overlap with stat cards, use getAllByText
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1);
  });

  it('displays stat cards', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_ITEMS })
      .mockResolvedValueOnce({ success: true, data: MOCK_STATS });
    await renderApprovals();

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('renders approval items with draft content', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_ITEMS })
      .mockResolvedValueOnce({ success: true, data: MOCK_STATS });
    await renderApprovals();

    await waitFor(() => {
      expect(screen.getByText(/Sarah J/)).toBeInTheDocument();
      expect(screen.getByText(/Mike C/)).toBeInTheDocument();
    });

    expect(screen.getByText(/pricing starts at/)).toBeInTheDocument();
    expect(screen.getByText(/87/)).toBeInTheDocument();
  });

  it('renders Approve and Reject buttons for pending items', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: MOCK_ITEMS })
      .mockResolvedValueOnce({ success: true, data: MOCK_STATS });
    await renderApprovals();

    await waitFor(() => {
      expect(screen.getAllByText('Approve').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Reject').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('handles empty items gracefully', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: MOCK_STATS });
    await renderApprovals();

    await waitFor(() => {
      expect(screen.getByText(/No items to review/)).toBeInTheDocument();
    });
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, data: MOCK_STATS });
    await renderApprovals();

    await waitFor(() => {
      expect(screen.getByText('Approvals Queue')).toBeInTheDocument();
    });
  });
});
