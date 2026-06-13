'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Check, ArrowRight, ArrowLeft, Instagram, Facebook,
  Upload, Link2, Bot, Zap, Sparkles,
} from 'lucide-react';

const STEPS = [
  {
    id: 'connect_instagram',
    title: 'Connect Instagram',
    description: 'Link your Instagram Business account',
    icon: Instagram,
  },
  {
    id: 'connect_facebook',
    title: 'Connect Facebook',
    description: 'Link your Facebook Page',
    icon: Facebook,
  },
  {
    id: 'upload_faqs',
    title: 'Upload Knowledge',
    description: 'Upload FAQs, pricing, or policies',
    icon: Upload,
  },
  {
    id: 'add_cta',
    title: 'Add Call-to-Action',
    description: 'Set up your first sales CTA',
    icon: Link2,
  },
  {
    id: 'choose_personality',
    title: 'AI Personality',
    description: 'Choose how your AI sounds',
    icon: Bot,
  },
  {
    id: 'turn_on_automation',
    title: 'Go Live',
    description: 'Launch your AI sales agent',
    icon: Zap,
  },
];

const PERSONALITIES = [
  { id: 'friendly', label: 'Friendly', desc: 'Warm and approachable', emoji: '😊' },
  { id: 'premium', label: 'Premium', desc: 'Professional and polished', emoji: '✨' },
  { id: 'luxury', label: 'Luxury', desc: 'Elegant and exclusive', emoji: '💎' },
  { id: 'customer_support', label: 'Support', desc: 'Helpful and patient', emoji: '🎯' },
  { id: 'sales_closer', label: 'Sales Closer', desc: 'Persuasive and confident', emoji: '🔥' },
];

const CTA_TYPES = [
  { value: 'website', label: 'Website', placeholder: 'https://yourwebsite.com' },
  { value: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/1234567890' },
  { value: 'calendly', label: 'Calendly', placeholder: 'https://calendly.com/your-link' },
  { value: 'demo_booking', label: 'Demo Booking', placeholder: 'https://yourapp.com/demo' },
  { value: 'payment_link', label: 'Payment Link', placeholder: 'https://buy.stripe.com/...' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  // Onboarding data
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [personality, setPersonality] = useState('friendly');
  const [ctaType, setCtaType] = useState('website');
  const [ctaUrl, setCtaUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');

  // ── Read URL params for Meta OAuth callback ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaConnected = params.get('meta_connected');
    const metaError = params.get('meta_error');

    if (metaConnected === 'instagram') {
      setInstagramConnected(true);
      setError('');
      // Clean up the URL without a full reload
      window.history.replaceState({}, '', window.location.pathname);
    } else if (metaConnected === 'facebook') {
      setFacebookConnected(true);
      setError('');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (metaError) {
      setError(decodeURIComponent(metaError));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Check current onboarding state
    api.get('/api/auth/me').then((res: any) => {
      if (res.success && res.data) {
        if (res.data.onboardingDone) {
          router.push('/');
          return;
        }
        const stepMap: Record<string, number> = {
          create_account: 0,
          connect_instagram: 0,
          connect_facebook: 1,
          upload_faqs: 2,
          add_cta: 3,
          choose_personality: 4,
          turn_on_automation: 5,
        };
        const savedStep = stepMap[res.data.onboardingStep] ?? 0;
        setCurrentStep(savedStep);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
  }, [router]);

  const [oauthWaiting, setOauthWaiting] = useState<string | null>(null);

  const handleConnect = (platform: 'instagram' | 'facebook') => {
    setError('');

    const token = localStorage.getItem('token');
    if (!token) {
      setError('You must be logged in first. Please refresh and try again.');
      return;
    }

    setOauthWaiting(platform);

    window.open(
      `${API_BASE}/api/meta/auth?platform=${platform}&token=${encodeURIComponent(token)}`,
      'Meta OAuth',
      'width=600,height=700,left=200,top=100'
    );
  };

  // Reset oauthWaiting when the user returns focus to this window
  // (popup was likely closed without completing authorization)
  useEffect(() => {
    const onFocus = () => {
      if (oauthWaiting) {
        // Give the redirect a moment to process before resetting
        setTimeout(() => {
          setOauthWaiting((prev) => {
            // Only reset if still waiting (not already connected via callback)
            if (prev) {
              setError('Authorization popup was closed. Click Connect to try again, or use Simulate Connect for development.');
              return null;
            }
            return prev;
          });
        }, 2000);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [oauthWaiting]);

  // Simulated fallback for development without Meta App credentials
  const handleSimulateConnect = (e: React.MouseEvent, platform: 'instagram' | 'facebook') => {
    e.stopPropagation();
    setOauthWaiting(null);
    if (platform === 'instagram') {
      setInstagramConnected(true);
    } else {
      setFacebookConnected(true);
    }
    setError('');
  };

  const handleNext = async () => {
    setError('');

    if (currentStep === 0 && !instagramConnected) {
      setError('Please connect your Instagram account to continue');
      return;
    }
    if (currentStep === 1 && !facebookConnected) {
      setError('Please connect your Facebook Page to continue');
      return;
    }
    if (currentStep === 3 && !ctaUrl) {
      setError('Please enter your CTA URL');
      return;
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step: go live
      setSubmitting(true);
      try {
        await api.post('/api/onboarding/complete', {
          personality,
          ctaType: ctaType || undefined,
          ctaUrl: ctaUrl || undefined,
          ctaLabel: ctaLabel || undefined,
        });
        setCompleted(true);
        setTimeout(() => router.push('/'), 1500);
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">You're live! 🎉</h1>
          <p className="text-gray-500">
            Your AI sales agent is now active. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  const Step = STEPS[currentStep];

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Set up your AI Sales Agent</h1>
          <span className="text-sm text-gray-500">
            Step {currentStep + 1} of {STEPS.length}
          </span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                'h-2 flex-1 rounded-full transition-all duration-300',
                i <= currentStep ? 'bg-primary' : 'bg-gray-200',
                i === currentStep && 'shadow-lg shadow-primary/30',
              )}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                'text-xs transition-colors hidden sm:block',
                i === currentStep ? 'text-primary font-medium' : 'text-gray-400',
              )}
            >
              {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Step.icon size={24} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{Step.title}</h2>
            <p className="text-gray-500 text-sm">{Step.description}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* Step 0: Connect Instagram */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div
                onClick={() => handleConnect('instagram')}
                className={cn(
                  'border-2 rounded-xl p-6 cursor-pointer transition-all text-center',
                  instagramConnected
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-200 hover:border-primary hover:bg-primary-50',
                )}
              >
                {instagramConnected ? (
                  <div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check size={24} className="text-green-600" />
                    </div>
                    <p className="font-medium text-green-700">Instagram Connected!</p>
                    <p className="text-sm text-green-600 mt-1">@your_business_account</p>
                  </div>
                ) : (
                  <div>
                    {oauthWaiting === 'instagram' ? (
                      <>
                        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                        <p className="font-medium text-gray-900">Waiting for authorization...</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Complete the authorization in the popup window
                        </p>
                      </>
                    ) : (
                      <>
                        <Instagram size={32} className="text-primary mx-auto mb-3" />
                        <p className="font-medium text-gray-900">Connect Instagram Business</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Click to connect your Instagram Business account
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          You'll be redirected to Meta to authorize access
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 text-center">
                Need an Instagram Business account?{' '}
                <a href="#" className="text-primary hover:underline">Convert your account</a>
              </p>
              {process.env.NODE_ENV !== 'production' && !instagramConnected && oauthWaiting !== 'instagram' && (
                <button
                  onClick={(e) => handleSimulateConnect(e, 'instagram')}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors border border-dashed border-gray-200 rounded-lg"
                >
                  Simulate Connect (development mode)
                </button>
              )}
            </div>
          )}

          {/* Step 1: Connect Facebook */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div
                onClick={() => handleConnect('facebook')}
                className={cn(
                  'border-2 rounded-xl p-6 cursor-pointer transition-all text-center',
                  facebookConnected
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-200 hover:border-primary hover:bg-primary-50',
                )}
              >
                {facebookConnected ? (
                  <div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check size={24} className="text-green-600" />
                    </div>
                    <p className="font-medium text-green-700">Facebook Page Connected!</p>
                    <p className="text-sm text-green-600 mt-1">Your Business Page</p>
                  </div>
                ) : (
                  <div>
                    {oauthWaiting === 'facebook' ? (
                      <>
                        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                        <p className="font-medium text-gray-900">Waiting for authorization...</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Complete the authorization in the popup window
                        </p>
                      </>
                    ) : (
                      <>
                        <Facebook size={32} className="text-primary mx-auto mb-3" />
                        <p className="font-medium text-gray-900">Connect Facebook Page</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Click to connect your Facebook Page
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          We need this to reply to comments and DMs
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              {process.env.NODE_ENV !== 'production' && !facebookConnected && oauthWaiting !== 'facebook' && (
                <button
                  onClick={(e) => handleSimulateConnect(e, 'facebook')}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors border border-dashed border-gray-200 rounded-lg"
                >
                  Simulate Connect (development mode)
                </button>
              )}
            </div>
          )}

          {/* Step 2: Upload FAQs / Knowledge */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-primary transition-colors cursor-pointer">
                <Upload size={32} className="text-gray-400 mx-auto mb-3" />
                <p className="font-medium text-gray-900">Upload your business knowledge</p>
                <p className="text-sm text-gray-500 mt-1">
                  Drop files or click to browse
                </p>
                <div className="flex justify-center gap-3 mt-4">
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">PDF</span>
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">DOCX</span>
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">TXT</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Upload FAQs, pricing sheets, or product info — your AI will use this to answer accurately
              </p>
              <button
                onClick={() => setError('')}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Skip this step (I'll upload later)
              </button>
            </div>
          )}

          {/* Step 3: Add CTA */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CTA_TYPES.map((cta) => (
                  <button
                    key={cta.value}
                    onClick={() => setCtaType(cta.value)}
                    className={cn(
                      'px-4 py-2.5 rounded-lg text-sm font-medium border transition-all',
                      ctaType === cta.value
                        ? 'border-primary bg-primary-50 text-primary'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {cta.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                <input
                  type="text"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder={`e.g. "Visit our website"`}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder={CTA_TYPES.find(t => t.value === ctaType)?.placeholder}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 4: Choose AI Personality */}
          {currentStep === 4 && (
            <div className="space-y-3">
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersonality(p.id)}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left',
                    personality === p.id
                      ? 'border-primary bg-primary-50'
                      : 'border-gray-100 hover:border-gray-200 bg-white',
                  )}
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{p.label}</p>
                    <p className="text-sm text-gray-500">{p.desc}</p>
                  </div>
                  {personality === p.id && (
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step 5: Go Live */}
          {currentStep === 5 && (
            <div className="text-center py-6 space-y-6">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <Zap size={40} className="text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Ready to launch!</h3>
                <p className="text-gray-500 mt-2 max-w-md mx-auto">
                  Your AI sales agent is configured and ready to start engaging with your customers.
                  Click below to go live.
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 max-w-sm mx-auto space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Instagram</span>
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <Check size={14} /> Connected
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Facebook</span>
                  <span className="text-green-600 font-medium flex items-center gap-1">
                    <Check size={14} /> Connected
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">AI Personality</span>
                  <span className="text-gray-900 font-medium capitalize">
                    {PERSONALITIES.find(p => p.id === personality)?.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">CTA</span>
                  <span className="text-gray-900 font-medium">
                    {ctaLabel || ctaType}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={handleNext}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
          >
            {submitting ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : currentStep === STEPS.length - 1 ? (
              <>
                <Sparkles size={16} /> Go Live
              </>
            ) : (
              <>
                Continue <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
