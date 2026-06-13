'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  BarChart3, Users, Link2, Upload, Bot, Zap,
  ArrowDown, TrendingDown, Activity, Target, Lightbulb,
} from 'lucide-react';

// ── Types ──

interface FunnelStep {
  step: string;
  label: string;
  count: number;
  pct: number;
  icon: any;
  color: string;
}

// ── Skeleton ──

function SkeletonFunnel() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
      <div className="h-6 w-48 bg-gray-200 rounded mb-6" />
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <div className="w-10 h-10 bg-gray-200 rounded-lg shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-4 w-16 bg-gray-200 rounded" />
            </div>
            <div className="h-2 bg-gray-100 rounded-full w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-40 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──

export default function FunnelsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [overview, setOverview] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const overviewRes = await api.get('/api/analytics/overview');
      if (overviewRes.success) {
        setOverview(overviewRes.data);
      } else {
        setError(true);
        toast.error('Failed to load analytics data');
      }
    } catch {
      setError(true);
      toast.error('Network error loading analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (error) {
    return (
      <div className="text-center py-20">
        <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-lg font-medium text-gray-900">Unable to load funnel data</h2>
        <p className="text-gray-500 mt-2 mb-4">Check your connection and try again</p>
        <button
          onClick={() => { setLoading(true); setError(false); loadData(); }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Build funnel from real data
  const totalSignups = overview?.totalUsers ?? 0;
  const totalConnections = overview?.totalConnections ?? 0;
  const totalKnowledge = overview?.totalDocuments ?? 0;
  const totalCtas = overview?.totalCtas ?? 0;
  const totalLeads = overview?.totalLeads ?? 0;
  const totalDeals = overview?.totalDeals ?? 0;

  const funnelSteps: FunnelStep[] = [
    { step: 'signup', label: 'Signups', count: Math.max(totalSignups, 1), pct: 100, icon: Users, color: 'bg-blue-500' },
    { step: 'connect', label: 'Connected Platform', count: Math.max(totalConnections, 0), pct: totalSignups > 0 ? Math.round((totalConnections / totalSignups) * 100) : 0, icon: Link2, color: 'bg-indigo-500' },
    { step: 'knowledge', label: 'Uploaded Knowledge', count: Math.max(totalKnowledge, 0), pct: totalSignups > 0 ? Math.round((totalKnowledge / totalSignups) * 100) : 0, icon: Upload, color: 'bg-purple-500' },
    { step: 'cta', label: 'Created CTA', count: Math.max(totalCtas, 0), pct: totalSignups > 0 ? Math.round((totalCtas / totalSignups) * 100) : 0, icon: Target, color: 'bg-pink-500' },
    { step: 'leads', label: 'Generated Leads', count: Math.max(totalLeads, 0), pct: totalSignups > 0 ? Math.round((totalLeads / totalSignups) * 100) : 0, icon: Activity, color: 'bg-amber-500' },
    { step: 'deals', label: 'Closed Deals', count: Math.max(totalDeals, 0), pct: totalSignups > 0 ? Math.round((totalDeals / totalSignups) * 100) : 0, icon: Zap, color: 'bg-green-500' },
  ];

  const toConn = totalConnections > 0 ? Math.round((totalLeads / totalConnections) * 100) : 0;
  const toDeal = totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversion Funnels</h1>
        <p className="text-gray-500 mt-1">Track user activation and conversion from signup to revenue</p>
      </div>

      {loading ? (
        <>
          <SkeletonFunnel />
          <SkeletonCards />
        </>
      ) : (
        <>
          {/* Activation Funnel */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                <BarChart3 size={18} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Signup → Go-Live Funnel</h2>
            </div>

            <div className="space-y-0">
              {funnelSteps.map((step, idx) => {
                const Icon = step.icon;
                return (
                  <div key={step.step}>
                    <div className="flex items-center gap-4 py-3 group">
                      <div className={`w-10 h-10 ${step.color} rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}>
                        <Icon size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-gray-900 group-hover:text-gray-700 transition-colors">{step.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-900">{step.count.toLocaleString()}</span>
                            <span className={`text-xs font-semibold w-12 text-right ${
                              step.pct >= 70 ? 'text-emerald-600' :
                              step.pct >= 40 ? 'text-amber-600' :
                              'text-gray-500'
                            }`}>{step.pct}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`${step.color} h-2.5 rounded-full transition-all duration-700 ease-out`}
                            style={{ width: `${step.pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    {idx < funnelSteps.length - 1 && (
                      <div className="flex justify-center py-0.5">
                        <ArrowDown size={14} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversion Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ConversionCard
              title="Signup → Connection"
              percent={funnelSteps[1].pct}
              detail={`${funnelSteps[1].count} of ${totalSignups} users connected a platform`}
              color="blue"
            />
            <ConversionCard
              title="Connection → Lead"
              percent={toConn}
              detail={`${totalLeads} leads from ${funnelSteps[1].count} connected users`}
              color="amber"
            />
            <ConversionCard
              title="Lead → Closed Deal"
              percent={toDeal}
              detail={`${totalDeals} deals from ${totalLeads} leads`}
              color="green"
            />
          </div>

          {/* Insight Box */}
          <div className="bg-gradient-to-br from-primary-50 via-primary-50/50 to-blue-50 rounded-xl border border-primary-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={18} className="text-primary" />
              <h3 className="font-semibold text-gray-900">Funnel Analysis</h3>
            </div>
            {totalSignups > 0 ? (
              <ul className="space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <span><strong>{totalSignups}</strong> users signed up. <strong>{totalConnections}</strong> connected a social platform ({funnelSteps[1].pct}% activation rate).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                  <span><strong>{totalLeads}</strong> leads generated, with <strong>{totalDeals}</strong> progressing to CRM deals.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span>Highest drop-off: <strong>Signup → Platform Connection</strong> ({100 - funnelSteps[1].pct}% drop). Consider improving onboarding flow.</span>
                </li>
                {totalDeals > 0 && (
                  <li className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                    <span>Deal conversion rate: <strong>{toDeal}%</strong> of leads become closed deals.</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No data yet. Signups will appear here as users onboard.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──

function ConversionCard({ title, percent, detail, color }: {
  title: string; percent: number; detail: string; color: string;
}) {
  const colorMap: Record<string, { text: string; bg: string; ring: string }> = {
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200/30' },
    amber: { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200/30' },
    green: { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200/30' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 transition-all hover:shadow-md hover:border-gray-200">
      <div className={`inline-flex items-center gap-1.5 ${c.text} ${c.bg} px-2 py-1 rounded-md text-xs font-medium mb-3 ring-1 ${c.ring}`}>
        <Activity size={14} />
        {title}
      </div>
      <p className="text-3xl font-bold text-gray-900">{percent}%</p>
      <p className="text-sm text-gray-500 mt-1.5">{detail}</p>
    </div>
  );
}
