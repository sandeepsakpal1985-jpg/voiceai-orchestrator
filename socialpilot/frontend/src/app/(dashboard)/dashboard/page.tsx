'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  LayoutDashboard, TrendingUp, Users, DollarSign, MessageSquare,
  AlertTriangle, HeartHandshake, Target, Zap, ArrowUp, ArrowDown,
  Shield, Eye, BarChart3, Activity,
} from 'lucide-react';
import OnboardingHealthScore from '@/components/OnboardingHealthScore';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [execSummary, setExecSummary] = useState<any>(null);
  const [missedStats, setMissedStats] = useState<any>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [followerGrowth, setFollowerGrowth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/overview?period=weekly'),
      api.get('/api/revenue/summary?period=monthly'),
      api.get('/api/revenue/executive-summary?period=weekly'),
      api.get('/api/missed-opportunities/stats'),
      api.get('/api/reputation/overview'),
      api.get('/api/meta-insights/followers?days=30'),
    ]).then(([overview, rev, exec, missed, rep, follower]) => {
      if (overview.success) setData(overview.data);
      if (rev.success) setRevenue(rev.data);
      if (exec.success) setExecSummary(exec.data);
      if (missed.success) setMissedStats(missed.data);
      if (rep.success) setReputation(rep.data);
      if (follower.success) setFollowerGrowth(follower.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Onboarding Health Score */}
      <OnboardingHealthScore />

      {/* Executive Summary */}
      {execSummary?.summary && (
        <div className="bg-gradient-to-br from-primary to-indigo-700 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={20} />
            <span className="font-semibold">Executive Summary</span>
          </div>
          <p className="text-white/90 leading-relaxed">{execSummary.summary}</p>
        </div>
      )}

      {/* Today's Activity + Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue widget */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-emerald-50 rounded-lg">
                <DollarSign size={16} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${revenue?.currentMonthRevenue?.toLocaleString() ?? '0'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Revenue This Month</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-blue-50 rounded-lg">
                <Target size={16} className="text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {revenue?.dealsWon ?? data?.deals?.won ?? 0}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Deals Won</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-purple-50 rounded-lg">
                <Users size={16} className="text-purple-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{data?.leads?.total ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">Leads Generated</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-amber-50 rounded-lg">
                <BarChart3 size={16} className="text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {revenue?.opportunitiesCreated ?? 0}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Opportunities</p>
          </div>
        </div>

        {/* AI Revenue % */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white">
          <p className="text-sm font-medium text-white/80">AI Generated Revenue</p>
          <p className="text-3xl font-bold mt-1">{revenue?.aiRevenuePercentage ?? 0}%</p>
          <p className="text-xs text-white/70 mt-1">
            ${revenue?.aiAttributedRevenue?.toLocaleString() ?? '0'} attributed to AI
          </p>
          <div className="mt-3 bg-white/20 rounded-full h-2">
            <div
              className="bg-white rounded-full h-2 transition-all"
              style={{ width: `${revenue?.aiRevenuePercentage || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main grid - 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Missed Opportunities */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="font-semibold text-gray-900">Missed Opportunities</h3>
            </div>
            {missedStats?.open > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {missedStats.open} open
              </span>
            )}
          </div>
          {missedStats ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Open</span>
                <span className="font-medium text-gray-900">{missedStats.open}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Resolved</span>
                <span className="font-medium text-emerald-600">{missedStats.resolved}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Potential Value</span>
                <span className="font-medium text-amber-600">
                  ${missedStats.totalPotentialValue?.toLocaleString() || '0'}
                </span>
              </div>
              {missedStats.open > 0 && (
                <a
                  href="/missed-opportunities"
                  className="block text-center mt-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
                >
                  Recover Opportunities
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No data yet</p>
          )}
        </div>

        {/* Reputation */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HeartHandshake size={18} className="text-rose-500" />
              <h3 className="font-semibold text-gray-900">Reputation</h3>
            </div>
            {reputation && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                reputation.reputationScore >= 70 ? 'bg-emerald-50 text-emerald-700' :
                reputation.reputationScore >= 50 ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                Score: {reputation.reputationScore}
              </span>
            )}
          </div>
          {reputation ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Positive</span>
                <span className="font-medium text-emerald-600">{reputation.positivePercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className="bg-emerald-500 rounded-full h-1.5" style={{ width: `${reputation.positivePercent}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-500">Negative</span>
                <span className="font-medium text-red-600">{reputation.negativePercent}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Escalations</span>
                <span className="font-medium text-amber-600">{reputation.openEscalations}</span>
              </div>
              {reputation.activeAlerts > 0 && (
                <div className="flex items-center gap-1 mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                  <AlertTriangle size={12} />
                  {reputation.activeAlerts} active alert{reputation.activeAlerts > 1 ? 's' : ''}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No data yet</p>
          )}
        </div>

        {/* Escalations */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-red-500" />
              <h3 className="font-semibold text-gray-900">Escalations</h3>
            </div>
            {(data?.escalations?.total ?? 0) > 0 && (
              <span className="bg-red-50 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {data?.escalations?.total} active
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{data?.escalations?.total ?? 0}</p>
          <p className="text-xs text-gray-500">Open escalations</p>
          {(data?.escalations?.total ?? 0) > 0 && (
            <a
              href="/inbox"
              className="block text-center mt-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
            >
              View Escalations
            </a>
          )}
        </div>
      </div>

      {/* AI Performance + Top CTAs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Performance */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">AI Performance</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3">
              <p className="text-2xl font-bold text-primary">{data?.comments?.rate ?? 0}%</p>
              <p className="text-xs text-gray-500 mt-1">Comment Reply Rate</p>
            </div>
            <div className="text-center p-3">
              <p className="text-2xl font-bold text-green-600">{data?.dms?.rate ?? 0}%</p>
              <p className="text-xs text-gray-500 mt-1">DM Response Rate</p>
            </div>
            <div className="text-center p-3">
              <p className="text-2xl font-bold text-purple-600">{data?.leads?.hot ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Hot Leads</p>
            </div>
            <div className="text-center p-3">
              <p className="text-2xl font-bold text-emerald-600">{data?.deals?.won ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Deals Won</p>
            </div>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Conversion Funnel</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Leads → Opportunities</span>
              <span className="font-medium text-gray-900">{revenue?.leadToOpportunityRate ?? 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-500 rounded-full h-2" style={{ width: `${revenue?.leadToOpportunityRate || 0}%` }} />
            </div>
            <div className="flex items-center justify-between text-sm mt-3">
              <span className="text-gray-600">Opportunities → Won</span>
              <span className="font-medium text-gray-900">{revenue?.opportunityToWonRate ?? 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-emerald-500 rounded-full h-2" style={{ width: `${revenue?.opportunityToWonRate || 0}%` }} />
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
              <span>{revenue?.leadsGenerated ?? 0} leads</span>
              <span>→</span>
              <span>{revenue?.opportunitiesCreated ?? 0} opportunities</span>
              <span>→</span>
              <span>{revenue?.dealsWon ?? 0} won</span>
            </div>
          </div>
        </div>
      </div>

      {/* Follower Growth + Customer Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follower Growth */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Follower Growth</h2>
          </div>
          {followerGrowth ? (
            <div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(followerGrowth.growth || {}).map(([platform, g]: [string, any]) => (
                  <div key={platform} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        platform === 'instagram' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {platform}
                      </span>
                      {followerGrowth.current?.[platform] && (
                        <span className="text-xs text-gray-400">
                          {followerGrowth.current[platform].followers.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className={`text-xl font-bold ${g.gained > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                      {g.gained > 0 ? '+' : ''}{g.gained}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {g.growthPercent > 0 ? (
                        <ArrowUp size={12} className="text-emerald-500" />
                      ) : g.growthPercent < 0 ? (
                        <ArrowDown size={12} className="text-red-500" />
                      ) : null}
                      <span className={`text-xs font-medium ${
                        g.growthPercent > 0 ? 'text-emerald-600' :
                        g.growthPercent < 0 ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {g.growthPercent > 0 ? '+' : ''}{g.growthPercent}% this month
                      </span>
                    </div>
                  </div>
                ))}
                {Object.keys(followerGrowth.growth || {}).length === 0 && (
                  <div className="col-span-2 text-center py-4">
                    <Activity size={20} className="mx-auto text-gray-300 mb-1" />
                    <p className="text-xs text-gray-500">Connect Instagram/Facebook to track growth</p>
                  </div>
                )}
              </div>
              {/* Mini sparkline */}
              {followerGrowth.history && followerGrowth.history.length > 1 && (
                <div className="flex items-end gap-0.5 h-10 mt-3">
                  {followerGrowth.history.slice(-14).map((day: any, i: number) => {
                    const maxF = Math.max(...followerGrowth.history.map((d: any) => d.followers), 1);
                    return (
                      <div key={i} className="flex-1 bg-gradient-to-t from-emerald-400 to-emerald-300 rounded-t"
                        style={{ height: `${(day.followers / maxF) * 100}%` }}
                        title={`${day.date}: ${day.followers}`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No data yet</p>
          )}
        </div>

        {/* Customer Growth */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Comment & DM Activity</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Comments Received</p>
              <p className="text-xl font-bold text-gray-900">{data?.comments?.total ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Comments Replied</p>
              <p className="text-xl font-bold text-gray-900">{data?.comments?.replied ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">DMs Received</p>
              <p className="text-xl font-bold text-gray-900">{data?.dms?.total ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">DMs Replied</p>
              <p className="text-xl font-bold text-gray-900">{data?.dms?.replied ?? 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
