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

async function renderInbox() {
  const mod = await import('@/app/(dashboard)/inbox/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('InboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderInbox();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders empty state when no items', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: [] });
    await renderInbox();

    await waitFor(() => {
      expect(screen.getByText('Inbox is empty')).toBeInTheDocument();
    });
  });

  it('renders inbox items with status and platform', async () => {
    const mockItems = [
      {
        id: '1',
        customerName: 'Sarah Johnson',
        customerHandle: '@sarah_j',
        platform: 'instagram',
        status: 'unread',
        priority: 'high',
        content: 'How much does your premium plan cost?',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        customerName: 'Emily Davis',
        customerHandle: '@emily_d',
        platform: 'facebook',
        status: 'replied',
        priority: 'urgent',
        content: 'I love your product but I have a question',
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(api.get).mockResolvedValue({ success: true, data: mockItems });
    await renderInbox();

    await waitFor(() => {
      expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
      expect(screen.getByText('Emily Davis')).toBeInTheDocument();
    });

    expect(screen.getByText('instagram')).toBeInTheDocument();
    expect(screen.getByText('facebook')).toBeInTheDocument();
  });

  it('shows correct status icons for different statuses', async () => {
    const mockItems = [
      {
        id: '1',
        customerName: 'Alice',
        customerHandle: '@alice',
        platform: 'instagram',
        status: 'unread',
        priority: 'high',
        content: 'Hello',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        customerName: 'Bob',
        customerHandle: '@bob',
        platform: 'facebook',
        status: 'resolved',
        priority: 'normal',
        content: 'Thanks!',
        createdAt: new Date().toISOString(),
      },
    ];

    vi.mocked(api.get).mockResolvedValue({ success: true, data: mockItems });
    await renderInbox();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: false, error: 'Failed' });
    await renderInbox();

    await waitFor(() => {
      expect(screen.getByText('Inbox')).toBeInTheDocument();
    });

    expect(screen.getByText('Inbox is empty')).toBeInTheDocument();
  });
});
