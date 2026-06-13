import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the api module before any imports that use it
vi.mock('@/lib/api', () => {
  const mockGet = vi.fn();
  const mockSetToken = vi.fn();
  return {
    api: {
      get: mockGet,
      setToken: mockSetToken,
    },
    __esModule: true,
  };
});

import { api } from '@/lib/api';

// Helper to render the dashboard page with mocked data
async function renderDashboard() {
  const mod = await import('@/app/(dashboard)/dashboard/page');
  const DashboardPage = mod.default || mod;
  return render(React.createElement(DashboardPage));
}

// Default empty responses for all 6 API calls the dashboard makes
function mockDefaultEmpty() {
  vi.mocked(api.get).mockResolvedValue({ success: true, data: {} });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', async () => {
    // Return a promise that never resolves to keep loading state
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    
    await renderDashboard();
    
    // Should show loading spinner
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders dashboard stats when data loads', async () => {
    // Dashboard calls 5 APIs; provide data for the overview and revenue endpoints
    const overviewData = {
      comments: { total: 42, replied: 38, rate: 90 },
      dms: { total: 28, replied: 25, rate: 89 },
      leads: { total: 15, hot: 5 },
      escalations: { total: 0 },
      deals: { total: 8, won: 3 },
    };
    const revenueData = { currentMonthRevenue: 12500, dealsWon: 3, aiRevenuePercentage: 75, aiAttributedRevenue: 9375 };

    // Set up 6 resolved values for the 6 API calls
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: overviewData })   // /api/analytics/overview
      .mockResolvedValueOnce({ success: true, data: revenueData })    // /api/revenue/summary
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/revenue/executive-summary
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/missed-opportunities/stats
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/reputation/overview
      .mockResolvedValueOnce({ success: true, data: {} });            // /api/meta-insights/followers

    await renderDashboard();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Revenue This Month')).toBeInTheDocument();
    });

    // Check stats are rendered    expect(screen.getByText('15')).toBeInTheDocument();  // leads
    // '3' appears in multiple places (deals won count, performance section)
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('75%')).toBeInTheDocument();  // AI Revenue %

    // Check performance section
    expect(screen.getByText('AI Performance')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();  // comment reply rate
    expect(screen.getByText('89%')).toBeInTheDocument();  // DM response rate
  });

  it('shows escalation alert when escalations exist', async () => {
    const overviewData = {
      comments: { total: 10, replied: 8, rate: 80 },
      dms: { total: 5, replied: 4, rate: 80 },
      leads: { total: 3, hot: 1 },
      escalations: { total: 2 },
      deals: { total: 2, won: 1 },
    };

    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: true, data: overviewData })   // /api/analytics/overview
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/revenue/summary
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/revenue/executive-summary
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/missed-opportunities/stats
      .mockResolvedValueOnce({ success: true, data: {} })             // /api/reputation/overview
      .mockResolvedValueOnce({ success: true, data: {} });            // /api/meta-insights/followers

    await renderDashboard();

    // Wait for data to load
    await waitFor(() => {
      // Escalations appears as both heading and stat label
      expect(screen.getAllByText('Escalations').length).toBeGreaterThanOrEqual(1);
    });

    // Should show escalation count
    expect(screen.getAllByText(/2/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open escalations')).toBeInTheDocument();
  });

  it('handles API failure gracefully', async () => {
    // All 6 API calls return failure
    vi.mocked(api.get)
      .mockResolvedValueOnce({ success: false, error: 'Failed' })     // /api/analytics/overview
      .mockResolvedValueOnce({ success: false, error: 'Failed' })     // /api/revenue/summary
      .mockResolvedValueOnce({ success: false, error: 'Failed' })     // /api/revenue/executive-summary
      .mockResolvedValueOnce({ success: false, error: 'Failed' })     // /api/missed-opportunities/stats
      .mockResolvedValueOnce({ success: false, error: 'Failed' })     // /api/reputation/overview
      .mockResolvedValueOnce({ success: false, error: 'Failed' });    // /api/meta-insights/followers

    await renderDashboard();

    // Page should render without crashing — check for a static element or default $0
    await waitFor(() => {
      expect(screen.getByText('Revenue This Month')).toBeInTheDocument();
    });

    // Should show default $0
    const zeroElements = screen.getAllByText((content) => content.includes('$0'));
    expect(zeroElements.length).toBeGreaterThanOrEqual(1);
  });
});
