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

const MOCK_HEALTH = {
  overallScore: 78,
  alerts: [
    { severity: 'warning', message: 'One connection token expiring soon' },
    { severity: 'info', message: 'Webhook received successfully' },
  ],
  connections: [
    { id: 'c1', platform: 'instagram', pageName: 'My Business', instagramUsername: '@mybiz', status: 'active', tokenExpiresAt: '2025-02-15T00:00:00Z', tokenDaysRemaining: 30, tokenExpired: false, tokenExpiringSoon: false },
    { id: 'c2', platform: 'facebook', pageName: 'Facebook Page', instagramUsername: null, status: 'active', tokenExpiresAt: '2025-01-20T00:00:00Z', tokenDaysRemaining: 5, tokenExpired: false, tokenExpiringSoon: true },
  ],
  webhooks: { total: 2, last24h: 45, last7d: 320, successRate: 98, errorRate: 2, lastReceivedAt: '2025-01-15T12:00:00Z', active: true },
  errors: { count: 1, lastError: 'Rate limit exceeded', lastErrorAt: '2025-01-14T10:00:00Z', recentErrors: [{ message: 'Rate limit exceeded on Instagram API', time: '2025-01-14T10:00:00Z' }] },
  lastChecked: '2025-01-15T12:00:00.000Z',
};

async function renderHealth() {
  const mod = await import('@/app/(dashboard)/health/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('HealthPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows loading state initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderHealth();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders header and score', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_HEALTH });
    await renderHealth();

    await waitFor(() => {
      expect(screen.getByText('Meta Health')).toBeInTheDocument();
    });

    expect(screen.getByText('78')).toBeInTheDocument();
  });

  it('renders connection items', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_HEALTH });
    await renderHealth();

    await waitFor(() => {
      expect(screen.getByText('My Business')).toBeInTheDocument();
      expect(screen.getByText(/Facebook Page/)).toBeInTheDocument();
    });
  });

  it('renders stat cards', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_HEALTH });
    await renderHealth();

    await waitFor(() => {
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('98%')).toBeInTheDocument();
    });

    expect(screen.getByText(/Success Rate/)).toBeInTheDocument();
  });

  it('shows alerts from health data', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_HEALTH });
    await renderHealth();

    await waitFor(() => {
      expect(screen.getByText(/token expiring soon/)).toBeInTheDocument();
    });
  });

  it('renders Run Health Check button', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: true, data: MOCK_HEALTH });
    await renderHealth();

    await waitFor(() => {
      expect(screen.getByText('Run Health Check')).toBeInTheDocument();
    });
  });

  it('renders error state on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ success: false, error: 'Failed to load health data' });
    await renderHealth();

    await waitFor(() => {
      expect(screen.getByText('Failed to load health data')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
