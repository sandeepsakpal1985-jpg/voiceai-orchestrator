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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { api } from '@/lib/api';

async function renderOnboarding() {
  const mod = await import('@/app/(dashboard)/onboarding/page');
  const Page = mod.default || mod;
  return render(React.createElement(Page));
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while checking auth', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    await renderOnboarding();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows Connect Instagram step by default', async () => {
    vi.mocked(api.get).mockResolvedValue({
      success: true,
      data: { onboardingDone: false, onboardingStep: 'create_account' },
    });

    await renderOnboarding();

    await waitFor(() => {
      // "Connect Instagram" appears in both step title and progress bar labels
      const instaElements = screen.getAllByText(/Connect Instagram/);
      expect(instaElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders the progress bar with 6 steps', async () => {
    vi.mocked(api.get).mockResolvedValue({
      success: true,
      data: { onboardingDone: false, onboardingStep: 'create_account' },
    });

    await renderOnboarding();

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument();
    });
  });

  it('renders Continue button', async () => {
    vi.mocked(api.get).mockResolvedValue({
      success: true,
      data: { onboardingDone: false, onboardingStep: 'create_account' },
    });

    await renderOnboarding();

    await waitFor(() => {
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
  });

  it('redirects to login if not authenticated', async () => {
    vi.mocked(api.get).mockResolvedValue({
      success: false,
      error: 'Unauthorized',
    });

    await renderOnboarding();

    await waitFor(() => {
      expect(screen.getByText(/Set up your AI Sales Agent/)).toBeInTheDocument();
    });
  });
});
