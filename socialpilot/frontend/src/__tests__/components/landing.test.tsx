import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockGetItem = vi.fn();
Object.defineProperty(window, 'localStorage', {
  value: { getItem: mockGetItem, setItem: vi.fn(), removeItem: vi.fn() },
});

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: any[]) => mockApiGet(...args),
  },
}));

describe('Landing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockReturnValue(null);
  });

  it('renders the hero section with headline', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Hire an AI employee')).toBeTruthy();
    expect(screen.getByText('in 5 minutes')).toBeTruthy();

    // Multiple "Start Free Trial" links (hero + pricing), use getAllByText
    const ctaButtons = screen.getAllByText('Start Free Trial');
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);

    // "Sign In" appears once in hero, "Sign in" appears in nav
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  it('renders the navigation bar', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('MetaPilot')).toBeTruthy();

    // Features appears in both desktop and mobile nav
    const featuresLinks = screen.getAllByText('Features');
    expect(featuresLinks.length).toBeGreaterThanOrEqual(1);

    // same for How It Works and Pricing
    const hiwLinks = screen.getAllByText('How It Works');
    expect(hiwLinks.length).toBeGreaterThanOrEqual(1);

    const pricingLinks = screen.getAllByText('Pricing');
    expect(pricingLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders stats section', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('10x')).toBeTruthy();
    expect(screen.getByText('87%')).toBeTruthy();
    expect(screen.getByText('3.2x')).toBeTruthy();
    expect(screen.getByText('24/7')).toBeTruthy();
  });

  it('renders features section with all 6 features', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('AI Sales Agent')).toBeTruthy();
    expect(screen.getByText('Smart Inbox')).toBeTruthy();
    expect(screen.getByText('Auto Lead Capture')).toBeTruthy();
    expect(screen.getByText('Growth Analytics')).toBeTruthy();
    expect(screen.getByText('Escalation Guard')).toBeTruthy();
    expect(screen.getByText('5-Minute Setup')).toBeTruthy();
  });

  it('renders how it works section', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    // Heading is "Go live in 3 simple steps" but with a <span> splitting the text
    // Use getAllByText with a regex to find parts
    expect(screen.getByText((_, element) => {
      return element?.textContent === 'Go live in 3 simple steps';
    })).toBeTruthy();

    expect(screen.getByText('Connect')).toBeTruthy();
    expect(screen.getByText('Configure')).toBeTruthy();
    expect(screen.getByText('Launch')).toBeTruthy();
  });

  it('renders pricing section with 3 tiers', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Starter')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Enterprise')).toBeTruthy();
  });

  it('renders testimonials', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Sarah Chen')).toBeTruthy();
    expect(screen.getByText('Marcus Johnson')).toBeTruthy();
  });

  it('renders the final CTA section', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Ready to hire your AI employee?')).toBeTruthy();
    expect(screen.getByText('Get Started Free')).toBeTruthy();
  });

  it('does not redirect to dashboard when no token is stored', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    await waitFor(() => {
      expect(mockApiGet).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('redirects to dashboard when user is authenticated', async () => {
    mockGetItem.mockReturnValue('valid-token');
    mockApiGet.mockResolvedValueOnce({ success: true, data: { id: '1' } });

    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/auth/me');
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });
});
