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

const MOCK_SETTINGS = {
  success: true,
  data: {
    businessName: 'My Business',
    website: '',
    industry: '',
    automationEnabled: true,
    approvalMode: false,
    timezone: 'UTC',
    defaultPersonality: 'friendly',
  },
};

const MOCK_USER = {
  success: true,
  data: { name: 'My Business', role: 'owner' },
};

async function renderSettings() {
  const mod = await import('@/app/(dashboard)/settings/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Settings page loads /api/settings and /api/auth/me, then ApiKeyManager loads /api/api-keys
    // Use mockResolvedValue as default fallback for any extra calls
    vi.mocked(api.get)
      .mockResolvedValueOnce(MOCK_SETTINGS)          // /api/settings
      .mockResolvedValueOnce(MOCK_USER)               // /api/auth/me
      .mockResolvedValue({ success: true, data: [] }); // fallback (e.g. /api/api-keys)
  });

  it('renders settings sections', async () => {
    await renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    expect(screen.getByText('Brand Information')).toBeInTheDocument();
    expect(screen.getByText('AI Personality')).toBeInTheDocument();
    expect(screen.getByText('Automation')).toBeInTheDocument();
  });

  it('loads user name into business name field', async () => {
    await renderSettings();

    await waitFor(() => {
      const input = screen.getByDisplayValue('My Business');
      expect(input).toBeInTheDocument();
    });
  });

  it('renders automation toggle checkboxes', async () => {
    await renderSettings();

    await waitFor(() => {
      expect(screen.getByText('AI Automation')).toBeInTheDocument();
      expect(screen.getByText('Approval Mode')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3); // AI Automation + Approval Mode + Hide Branding
  });

  it('renders Save Settings button', async () => {
    await renderSettings();

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });
});
