'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Bot, MessageSquare, Target, BarChart3, Shield, Zap,
  ArrowRight, Check, Menu, X, Star,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
      icon: Bot,
      title: 'AI Sales Agent',
      description: 'Hire an AI employee that works 24/7 — responding to comments, DMs, and conversations like a human.',
      color: 'text-blue-600', bg: 'bg-blue-50',
    },
    {
      icon: MessageSquare,
      title: 'Smart Inbox',
      description: 'All your Instagram & Facebook messages unified. AI auto-replies, human handoff when needed.',
      color: 'text-violet-600', bg: 'bg-violet-50',
    },
    {
      icon: Target,
      title: 'Auto Lead Capture',
      description: 'AI identifies hot leads from comments and DMs, scores them, and pushes them to your CRM.',
      color: 'text-emerald-600', bg: 'bg-emerald-50',
    },
    {
      icon: BarChart3,
      title: 'Growth Analytics',
      description: 'Real-time dashboards tracking engagement, conversion rates, revenue attribution, and ROI.',
      color: 'text-orange-600', bg: 'bg-orange-50',
    },
    {
      icon: Shield,
      title: 'Escalation Guard',
      description: 'AI detects escalations and angry customers instantly. Routes to human agents with full context.',
      color: 'text-rose-600', bg: 'bg-rose-50',
    },
    {
      icon: Zap,
      title: '5-Minute Setup',
      description: 'Connect your Instagram and Facebook accounts. Train the AI on your brand voice. Go live instantly.',
      color: 'text-primary', bg: 'bg-primary-50',
    },
  ];

  const steps = [
    { number: '01', title: 'Connect', description: 'Link your Instagram & Facebook business accounts with one click.' },
    { number: '02', title: 'Configure', description: 'Set your brand voice, auto-reply rules, and lead scoring preferences.' },
    { number: '03', title: 'Launch', description: 'Your AI sales agent goes live. Watch it engage, qualify, and convert.' },
  ];

  const stats = [
    { value: '10x', label: 'Faster Responses' },
    { value: '87%', label: 'Auto-Resolve Rate' },
    { value: '3.2x', label: 'More Leads' },
    { value: '24/7', label: 'AI Coverage' },
  ];

  const testimonials = [
    {
      quote: 'We went from 2-hour response times to under 30 seconds. Our engagement rate tripled in the first month.',
      author: 'Sarah Chen',
      role: 'Founder, Loom & Spruce',
      rating: 5,
    },
    {
      quote: 'The AI actually sounds like our brand. Customers don\'t even realize they\'re talking to an AI until we tell them.',
      author: 'Marcus Johnson',
      role: 'CEO, Thrive Market Co.',
      rating: 5,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'bg-white/80 backdrop-blur-lg border-b border-gray-100 shadow-sm' : 'bg-transparent',
      )}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <span className="font-semibold text-gray-900 text-lg">MetaPilot</span>
            </Link>

            <nav className="hidden lg:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900">How It Works</a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pricing</a>
            </nav>

            <div className="hidden lg:flex items-center gap-3">
              <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-50">Sign in</Link>
              <Link href="/register" className="text-sm font-medium text-white bg-primary hover:bg-primary-700 px-5 py-2.5 rounded-lg shadow-sm">Get Started</Link>
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
              <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-sm font-medium text-white bg-primary hover:bg-primary-700 rounded-lg text-center">Get Started</Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-blue-50" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-100/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-blue-100/50 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-primary-700">AI Sales Agent — Now Available</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight leading-tight">
              Hire an AI employee
              <span className="block text-primary mt-1">in 5 minutes</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              MetaPilot AI automates your Instagram and Facebook sales and support.
              Responds to comments, DMs, and conversations — 24/7 — like your best salesperson.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl font-medium hover:bg-primary-700 shadow-lg shadow-primary/25 hover:shadow-xl"
              >
                Start Free Trial
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-3.5 rounded-xl font-medium border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              >
                Sign In
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500">
              <Check size={14} className="text-green-500" />
              <span>No credit card required</span>
              <span className="text-gray-300">·</span>
              <Check size={14} className="text-green-500" />
              <span>5-minute setup</span>
              <span className="text-gray-300">·</span>
              <Check size={14} className="text-green-500" />
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Everything you need to <span className="text-primary">automate social sales</span>
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
                  className="group bg-white rounded-2xl border border-gray-100 p-6 hover:border-gray-200 hover:shadow-lg transition-all duration-300"
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
              Go live in <span className="text-primary">3 simple steps</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              No engineering team required.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, i) => (
              <div key={step.title} className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-px border-t-2 border-dashed border-gray-200" />
                )}
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
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
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((t) => (
              <div key={t.author} className="bg-white rounded-2xl border border-gray-100 p-8 hover:shadow-lg transition-shadow">
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
            <p className="mt-4 text-lg text-gray-600">Start free. Upgrade when you grow.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 hover:shadow-lg transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
              <p className="text-3xl font-bold text-gray-900 mt-4">$29<span className="text-sm font-normal text-gray-500">/mo</span></p>
              <p className="text-sm text-gray-500 mt-1">For solo creators</p>
              <ul className="mt-6 space-y-3">
                {['1 Instagram account', '100 AI replies/day', 'Basic analytics', 'Email support'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check size={14} className="text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block w-full text-center bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-gray-800 text-sm">Start Free Trial</Link>
            </div>

            <div className="bg-white rounded-2xl border-2 border-primary shadow-xl shadow-primary/10 p-8 relative hover:shadow-2xl transition-shadow">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-medium px-4 py-1 rounded-full">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
              <p className="text-3xl font-bold text-gray-900 mt-4">$79<span className="text-sm font-normal text-gray-500">/mo</span></p>
              <p className="text-sm text-gray-500 mt-1">For growing teams</p>
              <ul className="mt-6 space-y-3">
                {['Up to 5 accounts', 'Unlimited AI replies', 'Advanced analytics', 'Lead scoring & CRM', 'Priority support', 'Team collaboration'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check size={14} className="text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block w-full text-center bg-primary text-white py-3 rounded-xl font-medium hover:bg-primary-700 text-sm shadow-lg shadow-primary/25">Start Free Trial</Link>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-8 hover:shadow-lg transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900">Enterprise</h3>
              <p className="text-3xl font-bold text-gray-900 mt-4">Custom</p>
              <p className="text-sm text-gray-500 mt-1">For large organizations</p>
              <ul className="mt-6 space-y-3">
                {['Unlimited accounts', 'Custom AI training', 'Dedicated account manager', 'SSO & audit logs', '99.9% SLA', 'Custom integrations'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check size={14} className="text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/register" className="mt-8 block w-full text-center bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-gray-800 text-sm">Contact Sales</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-br from-primary via-primary-700 to-blue-700 rounded-3xl p-10 sm:p-16 shadow-2xl shadow-primary/30">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Ready to hire your AI employee?
            </h2>
            <p className="mt-4 text-lg text-primary-100 max-w-lg mx-auto">
              Join thousands of businesses automating their social sales with MetaPilot AI.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-2 bg-white text-primary px-8 py-3.5 rounded-xl font-medium hover:bg-primary-50 shadow-lg"
            >
              Get Started Free
              <ArrowRight size={18} />
            </Link>
            <p className="mt-4 text-sm text-primary-200">No credit card required · 5-minute setup · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-sm font-medium text-gray-900">MetaPilot AI</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#features" className="hover:text-gray-900">Features</a>
              <a href="#pricing" className="hover:text-gray-900">Pricing</a>
              <Link href="/login" className="hover:text-gray-900">Sign in</Link>
              <Link href="/register" className="hover:text-gray-900">Sign up</Link>
            </div>
            <p className="text-xs text-gray-400">&copy; 2025 MetaPilot AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
