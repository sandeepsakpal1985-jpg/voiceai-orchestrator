'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import Logo from '@/components/Logo';
import TrustStrip from '@/components/TrustStrip';
import {
  Bot, MessageSquare, Target, BarChart3, Shield, Zap,
  ArrowRight, Check, Menu, X, Star, Brain, TrendingUp, Users,
  Play,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleTryDemo = async () => {
    setDemoLoading(true);
    const result = await api.post<{ token: string }>('/api/demo/login');
    if (result.success && result.data?.token) {
      api.setToken(result.data.token);
      router.push('/dashboard');
    }
    setDemoLoading(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/api/auth/me').then((res: any) => {
        if (res.success) router.push('/dashboard');
      });
    }

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [router]);

  const features = [
    {
      icon: MessageSquare,
      title: 'AI Comment & DM Replies',
      description: 'Instant, on-brand responses to every Instagram comment and Facebook DM — 24/7.',
      color: 'text-primary-600', bg: 'bg-primary-50',
    },
    {
      icon: Target,
      title: 'Lead Capture',
      description: 'AI spots buying signals, scores leads, and routes hot prospects to your team.',
      color: 'text-accent-600', bg: 'bg-accent-50',
    },
    {
      icon: TrendingUp,
      title: 'Built-in CRM',
      description: 'Deals, pipeline stages, and revenue tracking — no extra tools needed.',
      color: 'text-secondary-600', bg: 'bg-secondary-50',
    },
    {
      icon: Brain,
      title: 'Customer Memory',
      description: 'AI remembers past conversations so every reply feels personal.',
      color: 'text-purple-600', bg: 'bg-purple-50',
    },
    {
      icon: Shield,
      title: 'Smart Escalation',
      description: 'Angry customers and legal threats are flagged and routed to humans instantly.',
      color: 'text-rose-600', bg: 'bg-rose-50',
    },
    {
      icon: BarChart3,
      title: 'Analytics & ROI',
      description: 'Track response rates, leads captured, and revenue influenced in one dashboard.',
      color: 'text-blue-600', bg: 'bg-blue-50',
    },
  ];

  const steps = [
    { number: '01', title: 'Connect Meta', description: 'Link your Instagram Business and Facebook Page with secure OAuth.' },
    { number: '02', title: 'Upload FAQs', description: 'Train the AI on your pricing, policies, and brand voice.' },
    { number: '03', title: 'AI Starts Selling', description: 'Go live — every comment and DM becomes a sales opportunity.' },
  ];

  const pilotLogos = ['Bloom Studio', 'FitCore', 'DentalPro', 'StyleHaus', 'TechNest'];

  const testimonials = [
    {
      quote: 'We went from 2-hour response times to under 30 seconds. Our engagement rate tripled in the first month.',
      author: 'Priya Sharma',
      role: 'Founder, Bloom Studio',
      rating: 5,
    },
    {
      quote: 'KluConnect sounds exactly like our brand. Customers don\'t realize they\'re talking to AI until we tell them.',
      author: 'Rahul Mehta',
      role: 'CEO, FitCore India',
      rating: 5,
    },
  ];

  const pricing = [
    {
      name: 'Starter',
      price: '₹2,900',
      period: '/mo',
      replies: '1,000 AI replies',
      features: ['1 Instagram + Facebook', 'Lead capture & CRM', 'Basic analytics', 'Email support'],
      cta: 'Start Free Trial',
      popular: false,
    },
    {
      name: 'Pro',
      price: '₹7,900',
      period: '/mo',
      replies: '3,000 AI replies',
      features: ['Everything in Starter', 'Customer memory', 'Advanced analytics', 'Escalation guard', 'Priority support'],
      cta: 'Start Free Trial',
      popular: true,
    },
    {
      name: 'Agency',
      price: '₹19,900',
      period: '/mo',
      replies: 'Unlimited replies',
      features: ['Everything in Pro', 'Multi-client management', 'White-label options', 'Dedicated onboarding', 'Partner portal'],
      cta: 'Start Free Trial',
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'bg-white/90 backdrop-blur-lg border-b border-gray-100 shadow-sm' : 'bg-transparent',
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-2">
              <Logo size="md" />
            </Link>

            <nav className="hidden lg:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900">How It Works</a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pricing</a>
            </nav>

            <div className="hidden lg:flex items-center gap-3">
              <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50">Sign in</Link>
              <Link href="/register" className="text-sm font-medium text-white bg-primary hover:bg-primary-700 px-5 py-2.5 rounded-lg shadow-brand">Start Free Trial</Link>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-gray-100 shadow-lg">
            <div className="px-4 py-4 space-y-2">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">How It Works</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Pricing</a>
              <hr className="my-2 border-gray-100" />
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">Sign in</Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-white bg-primary hover:bg-primary-700 rounded-lg text-center">Start Free Trial</Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-secondary-50" />
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-100/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-secondary-100/40 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white border border-primary-100 rounded-full px-4 py-1.5 mb-6 shadow-sm">
              <span className="w-2 h-2 bg-accent-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-primary-700">Pilot Program — Limited Spots</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-tight">
              Turn Every Comment
              <span className="block text-gradient-brand mt-1">Into A Customer</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              KluConnect is your AI social sales employee — auto-replying to Instagram comments
              and Facebook DMs, capturing leads, and closing sales while you sleep.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl font-medium hover:bg-primary-700 shadow-brand hover:shadow-brand-lg transition-shadow"
              >
                Start Free Trial
                <ArrowRight size={18} />
              </Link>
              <button
                onClick={handleTryDemo}
                disabled={demoLoading}
                id="demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-800 px-8 py-3.5 rounded-xl font-medium border border-gray-200 hover:border-secondary-300 hover:bg-secondary-50 shadow-sm disabled:opacity-50"
              >
                <Play size={16} className="text-secondary-600" />
                {demoLoading ? 'Loading Demo...' : 'Watch Demo'}
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Check size={14} className="text-accent-500" /> No credit card</span>
              <span className="flex items-center gap-1"><Check size={14} className="text-accent-500" /> 5-minute setup</span>
              <span className="flex items-center gap-1"><Check size={14} className="text-accent-500" /> Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="py-10 border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-medium text-gray-400 uppercase tracking-wider mb-6">
            Trusted by early pilot customers
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {pilotLogos.map((name) => (
              <span key={name} className="text-sm font-semibold text-gray-300 hover:text-gray-400 transition-colors">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Everything to <span className="text-gradient-brand">automate social sales</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              One platform. AI-powered. Works while you sleep.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group bg-white rounded-2xl border border-gray-100 p-6 hover:border-primary-100 hover:shadow-brand transition-all duration-300"
                >
                  <div className={`p-3 rounded-xl ${feature.bg} w-fit mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon size={22} className={feature.color} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 lg:py-28 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Live in <span className="text-primary">3 simple steps</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600">No engineering team required.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, i) => (
              <div key={step.title} className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-px border-t-2 border-dashed border-gray-200" />
                )}
                <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-brand">
                  <span className="text-white font-bold text-lg">{step.number}</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Loved by <span className="text-primary">business owners</span>
            </h2>
            <p className="mt-3 text-sm text-gray-500">Pilot customer feedback — names anonymized for privacy</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((t) => (
              <div key={t.author} className="bg-white rounded-2xl border border-gray-100 p-8 hover:shadow-brand transition-shadow">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} size={16} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <p className="font-semibold text-gray-900">{t.author}</p>
                  <p className="text-sm text-gray-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 lg:py-28 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Simple pricing. <span className="text-primary">No surprises.</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600">INR pricing for Indian businesses. Start free, upgrade when you grow.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricing.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'bg-white rounded-2xl p-8 transition-shadow',
                  plan.popular
                    ? 'border-2 border-primary shadow-brand-lg relative'
                    : 'border border-gray-100 hover:shadow-brand',
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-medium px-4 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="text-3xl font-bold text-gray-900 mt-4">
                  {plan.price}<span className="text-sm font-normal text-gray-500">{plan.period}</span>
                </p>
                <p className="text-sm text-secondary-600 font-medium mt-1">{plan.replies}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                      <Check size={14} className="text-accent-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={cn(
                    'mt-8 block w-full text-center py-3 rounded-xl font-medium text-sm transition-colors',
                    plan.popular
                      ? 'bg-primary text-white hover:bg-primary-700 shadow-brand'
                      : 'bg-gray-900 text-white hover:bg-gray-800',
                  )}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <TrustStrip />

      {/* Final CTA */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-primary-600 via-secondary-600 to-accent-600 rounded-3xl p-10 sm:p-16 shadow-brand-lg">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Ready to turn comments into customers?
            </h2>
            <p className="mt-4 text-lg text-white/80 max-w-lg mx-auto">
              Join the KluConnect pilot. Limited spots for businesses ready to automate Instagram &amp; Facebook sales.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 bg-white text-primary-700 px-8 py-3.5 rounded-xl font-medium hover:bg-primary-50 shadow-lg"
            >
              Start Free Trial
              <ArrowRight size={18} />
            </Link>
            <p className="mt-4 text-sm text-white/60">No credit card required · 5-minute setup · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <TrustStrip variant="footer" className="py-0 mb-8" />
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo size="sm" />
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#features" className="hover:text-gray-900">Features</a>
              <a href="#pricing" className="hover:text-gray-900">Pricing</a>
              <Link href="/login" className="hover:text-gray-900">Sign in</Link>
              <Link href="/register" className="hover:text-gray-900">Sign up</Link>
            </div>
            <p className="text-xs text-gray-400">&copy; 2026 KluConnect. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
