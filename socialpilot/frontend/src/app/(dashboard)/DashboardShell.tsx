'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import UsageBadge from '@/components/UsageBadge';
import DemoBanner from '@/components/DemoBanner';
import DemoScenarioPanel from '@/components/DemoScenarioPanel';
import { useDemo } from '@/lib/demo-context';
import { cn } from '@/lib/utils';
import Logo from '@/components/Logo';
import {
  LayoutDashboard, MessageSquare, Users, TrendingUp,
  BarChart3, Settings, BookOpen, UserCog, Lightbulb,
  Menu, X, LogOut, Shield, AlertTriangle, HeartHandshake, GitFork, Zap,
  CreditCard, Trophy, Activity, Handshake,
} from 'lucide-react';

const sidebarLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/success', label: 'Success', icon: Trophy },
  { href: '/health', label: 'Health', icon: Activity },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/crm', label: 'CRM', icon: TrendingUp },
  { href: '/approvals', label: 'Approvals', icon: Shield },
  { href: '/missed-opportunities', label: 'Missed Opps', icon: AlertTriangle },
  { href: '/reputation', label: 'Reputation', icon: HeartHandshake },
  { href: '/reengagement', label: 'Re-engage', icon: Zap },
  { href: '/growth', label: 'Growth', icon: BarChart3 },
  { href: '/insights', label: 'Insights', icon: Lightbulb },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/funnels', label: 'Funnels', icon: GitFork },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/team', label: 'Team', icon: UserCog },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/partner-portal', label: 'Partner Portal', icon: Handshake },
  { href: '/content', label: 'Content', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDemo, loading: demoLoading } = useDemo();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [brandConfig, setBrandConfig] = useState<{
    primaryColor: string;
    logo: string | null;
    hideBranding: boolean;
    businessName: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/auth/me'),
      api.get('/api/settings'),
    ]).then(([meRes, settingsRes]: [any, any]) => {
      if (meRes.success) {
        setUser(meRes.data);
        if (!meRes.data.onboardingDone && pathname !== '/onboarding' && !demoLoading && !isDemo) {
          router.push('/onboarding');
        }
      } else {
        router.push('/login');
      }
      if (settingsRes.success && settingsRes.data) {
        setBrandConfig({
          primaryColor: settingsRes.data.primaryColor || '#6366f1',
          logo: settingsRes.data.logo || null,
          hideBranding: settingsRes.data.hideBranding || false,
          businessName: settingsRes.data.businessName || 'KluConnect',
        });
      }
    });
  }, [router, pathname, isDemo, demoLoading]);

  const handleLogout = () => {
    api.setToken(null);
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={cn(
        'fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-gray-200 transition-transform duration-200',
        'lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-gray-100">
            <Link href="/dashboard" className="flex items-center gap-3">
              {brandConfig?.logo ? (
                <img src={brandConfig.logo} alt="Logo" className="h-8 w-auto" onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }} />
              ) : brandConfig?.hideBranding ? (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: brandConfig?.primaryColor || '#2563eb' }}>
                  <span className="text-white font-bold text-sm">
                    {(brandConfig?.businessName || 'K').charAt(0)}
                  </span>
                </div>
              ) : (
                <Logo variant="mark" size="sm" />
              )}
              <div>
                <p className="font-semibold text-gray-900">{brandConfig?.businessName || 'KluConnect'}</p>
                <p className="text-xs text-gray-500">Turn Every Comment Into A Customer</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary-50 text-primary'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={18} />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Usage Badge */}
          <UsageBadge />

          <div className="p-4 border-t border-gray-100">
            {user && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600">
                      {user.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{user.role?.replace('_', ' ')}</p>
                  </div>
                </div>
                <button onClick={handleLogout} className="p-1 hover:bg-gray-100 rounded">
                  <LogOut size={16} className="text-gray-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="lg:ml-64 min-h-screen">
        <DemoBanner />
        <div className="p-6 lg:p-8 pt-16 lg:pt-8">
          {children}
        </div>
        <DemoScenarioPanel />
      </main>
    </div>
  );
}
