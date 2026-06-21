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

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}));

const mockGetItem = vi.fn();
Object.defineProperty(window, 'localStorage', {
  value: { getItem: mockGetItem, setItem: vi.fn(), removeItem: vi.fn() },
});

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
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

    const hero = screen.getByRole('heading', { level: 1 });
    expect(hero.textContent).toContain('Turn Every Comment');
    expect(hero.textContent).toContain('Into A Customer');

    const ctaButtons = screen.getAllByText('Start Free Trial');
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText('Watch Demo')).toBeTruthy();
  });

  it('renders the navigation bar', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    const logos = screen.getAllByAltText('KluConnect');
    expect(logos.length).toBeGreaterThanOrEqual(1);

    const featuresLinks = screen.getAllByText('Features');
    expect(featuresLinks.length).toBeGreaterThanOrEqual(1);

    const hiwLinks = screen.getAllByText('How It Works');
    expect(hiwLinks.length).toBeGreaterThanOrEqual(1);

    const pricingLinks = screen.getAllByText('Pricing');
    expect(pricingLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders features section with all 6 features', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('AI Comment & DM Replies')).toBeTruthy();
    expect(screen.getByText('Lead Capture')).toBeTruthy();
    expect(screen.getByText('Built-in CRM')).toBeTruthy();
    expect(screen.getByText('Customer Memory')).toBeTruthy();
    expect(screen.getByText('Smart Escalation')).toBeTruthy();
    expect(screen.getByText('Analytics & ROI')).toBeTruthy();
  });

  it('renders how it works section', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText((_, element) => {
      return element?.textContent === 'Live in 3 simple steps';
    })).toBeTruthy();

    expect(screen.getByText('Connect Meta')).toBeTruthy();
    expect(screen.getByText('Upload FAQs')).toBeTruthy();
    expect(screen.getByText('AI Starts Selling')).toBeTruthy();
  });

  it('renders pricing section with 3 tiers', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Starter')).toBeTruthy();
    expect(screen.getByText('Pro')).toBeTruthy();
    expect(screen.getByText('Agency')).toBeTruthy();
    expect(screen.getByText('₹2,900')).toBeTruthy();
  });

  it('renders testimonials', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Priya Sharma')).toBeTruthy();
    expect(screen.getByText('Rahul Mehta')).toBeTruthy();
  });

  it('renders trust signals', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    const secureOAuth = screen.getAllByText('Secure OAuth');
    expect(secureOAuth.length).toBeGreaterThanOrEqual(1);
    const gdpr = screen.getAllByText('GDPR Ready');
    expect(gdpr.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the final CTA section', async () => {
    const LandingPage = (await import('@/app/page')).default;
    render(<LandingPage />);

    expect(screen.getByText('Ready to turn comments into customers?')).toBeTruthy();
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
