'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { TrendingUp, BarChart3, DollarSign, Target, Users, ArrowUp, ArrowDown, Activity } from 'lucide-react';

export default function GrowthPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [funnel, setFunnel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [followerGrowth, setFollowerGrowth] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/leads'),
      api.get('/api/analytics/growth'),
      api.get('/api/revenue/summary?period=monthly'),
      api.get('/api/revenue/trend'),
      api.get('/api/revenue/funnel'),
      api.get('/api/meta-insights/followers?days=30'),
    ]).then(([leadsRes, growthRes, revRes, trendRes, funnelRes, followerRes]) => {
      if (leadsRes.success) setMetrics(leadsRes.data);
      if (growthRes.success) setMetrics((prev: any) => ({ ...prev, growth: growthRes.data }));
      if (revRes.success) setRevenue(revRes.data);
      if (trendRes.success && Array.isArray(trendRes.data)) setTrend(trendRes.data);
      if (funnelRes.success) setFunnel(funnelRes.data);
      if (followerRes.success) setFollowerGrowth(followerRes.data);
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

  const maxTrendRevenue = Math.max(...trend.map((t: any) => t.revenue), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Growth</h1>
        <p className="text-gray-500 mt-1">Track your business performance and revenue trends</p>
      </div>

      {/* Top revenue metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white">
          <p className="text-sm text-white/80">Total Revenue</p>
          <p className="text-3xl font-bold mt-1">${revenue?.totalRevenue?.toLocaleString() ?? '0'}</p>
          <p className="text-xs text-white/70 mt-1">Lifetime</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">This Month</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            ${revenue?.currentMonthRevenue?.toLocaleString() ?? '0'}
          </p>
          {revenue && revenue.previousPeriodRevenue > 0 && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${
              revenue.currentMonthRevenue >= revenue.previousPeriodRevenue ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {revenue.currentMonthRevenue >= revenue.previousPeriodRevenue ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {Math.round((revenue.currentMonthRevenue - revenue.previousPeriodRevenue) / revenue.previousPeriodRevenue * 100)}% vs last period
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Deals Won</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{revenue?.dealsWon ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">
            {revenue?.previousDealsWon > 0 ? `${revenue.previousDealsWon} previous period` : ''}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm text-gray-500">AI Revenue %</p>
          <p className="text-3xl font-bold text-primary mt-1">{revenue?.aiRevenuePercentage ?? 0}%</p>
          <p className="text-xs text-gray-400 mt-1">Attributed to AI</p>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      {trend.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Revenue Trend</h2>
          </div>
          <div className="flex items-end gap-2 h-48">
            {trend.map((item: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-xs text-emerald-600 font-medium">
                  ${(item.revenue / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full bg-gradient-to-t from-emerald-500 to-emerald-400 rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                  style={{ height: `${Math.max((item.revenue / maxTrendRevenue) * 100, 2)}%` }}
                  title={`${item.month}: $${item.revenue.toLocaleString()} (${item.count} deals)`}
                />
                <span className="text-xs text-gray-400 mt-1">{item.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      {funnel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target size={18} className="text-primary" />
              <h2 className="font-semibold text-gray-900">Conversion Funnel</h2>
            </div>
            <div className="space-y-4">
              {/* Lead → Opportunity */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Lead → Opportunity</span>
                  <span className="font-medium text-gray-900">{funnel.leadToOpportunity}%</span>
                </div>
                <div className="flex gap-1">
                  <div className="bg-blue-500 rounded-l h-6 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: '100%' }}>
                    {funnel.leads} leads
                  </div>
                  <div className="bg-blue-400 h-6 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(funnel.opportunities / Math.max(funnel.leads, 1)) * 100}%` }}>
                    {funnel.opportunities}
                  </div>
                </div>
              </div>
              {/* Opportunity → Won */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Opportunity → Won</span>
                  <span className="font-medium text-gray-900">{funnel.opportunityToWon}%</span>
                </div>
                <div className="flex gap-1">
                  <div className="bg-emerald-500 rounded-l h-6 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: '100%' }}>
                    {funnel.opportunities} opps
                  </div>
                  <div className="bg-emerald-400 h-6 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(funnel.won / Math.max(funnel.opportunities, 1)) * 100}%` }}>
                    {funnel.won} won
                  </div>
                </div>
              </div>
              {/* Opportunity → Lost */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Opportunity → Lost</span>
                  <span className="font-medium text-gray-900">{funnel.opportunityToLost}%</span>
                </div>
                <div className="flex gap-1">
                  <div className="bg-gray-400 rounded-l h-6 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: '100%' }}>
                    {funnel.opportunities} opps
                  </div>
                  <div className="bg-red-400 h-6 flex items-center justify-center text-white text-xs font-medium"
                    style={{ width: `${(funnel.lost / Math.max(funnel.opportunities, 1)) * 100}%` }}>
                    {funnel.lost} lost
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lead Metrics */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-primary" />
              <h2 className="font-semibold text-gray-900">Lead Distribution</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-700">{metrics?.total ?? 0}</p>
                <p className="text-xs text-blue-600">Total Leads</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-purple-700">{metrics?.vip ?? 0}</p>
                <p className="text-xs text-purple-600">VIP</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-red-700">{metrics?.hot ?? 0}</p>
                <p className="text-xs text-red-600">Hot</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-amber-700">{metrics?.warm ?? 0}</p>
                <p className="text-xs text-amber-600">Warm</p>
              </div>
            </div>

            {/* Lead by source */}
            {metrics?.bySource && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">By Source</p>
                {Object.entries(metrics.bySource).map(([source, count]: [string, any]) => (
                  <div key={source} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600 capitalize">{source}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-primary rounded-full h-1.5"
                          style={{ width: `${(count / Math.max(metrics.total, 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-900 w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Follower Growth Section */}
      {followerGrowth && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Follower Growth</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(followerGrowth.growth || {}).map(([platform, data]: [string, any]) => (
              <div key={platform} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    platform === 'instagram' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {platform}
                  </span>
                  {followerGrowth.current?.[platform] && (
                    <span className="text-xs text-gray-400">
                      {followerGrowth.current[platform].followers.toLocaleString()} total
                    </span>
                  )}
                </div>
                <p className={`text-2xl font-bold ${data.gained > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                  {data.gained > 0 ? '+' : ''}{data.gained}
                </p>
                <p className="text-xs text-gray-500">Followers gained</p>
                {data.growthPercent !== 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    {data.growthPercent > 0 ? (
                      <ArrowUp size={12} className="text-emerald-500" />
                    ) : (
                      <ArrowDown size={12} className="text-red-500" />
                    )}
                    <span className={`text-xs font-medium ${data.growthPercent > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {Math.abs(data.growthPercent)}% growth
                    </span>
                  </div>
                )}
              </div>
            ))}
            {Object.keys(followerGrowth.growth || {}).length === 0 && (
              <div className="col-span-4 text-center py-6">
                <Activity size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Connect Instagram or Facebook to track follower growth</p>
              </div>
            )}
          </div>

          {/* Follower History Chart */}
          {followerGrowth.history && followerGrowth.history.length > 0 && (
            <div className="mt-4">
              <div className="flex items-end gap-1 h-24">
                {followerGrowth.history.slice(-30).map((day: any, i: number) => {
                  const maxFollowers = Math.max(...followerGrowth.history.map((d: any) => d.followers), 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-gradient-to-t from-emerald-400 to-emerald-300 rounded-t hover:opacity-80 transition-opacity"
                        style={{ height: `${(day.followers / maxFollowers) * 100}%` }}
                        title={`${day.date}: ${day.followers} followers`}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">Last {followerGrowth.days || 30} days</p>
            </div>
          )}

          {/* Snapshot Button */}
          <button
            onClick={async () => {
              const res = await api.post('/api/meta-insights/followers/snapshot');
              if (res.success) {
                const growthRes = await api.get('/api/meta-insights/followers?days=30');
                if (growthRes.success) setFollowerGrowth(growthRes.data);
              }
            }}
            className="mt-3 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Refresh follower data
          </button>
        </div>
      )}

      {/* Daily Lead Growth chart */}
      {metrics?.growth?.dailyLeads && metrics.growth.dailyLeads.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Daily Lead Growth (30 days)</h2>
          </div>
          <div className="flex items-end gap-1 h-32">
            {metrics.growth.dailyLeads.slice(-30).map((day: any, i: number) => {
              const maxCount = Math.max(...metrics.growth.dailyLeads.map((d: any) => d.count), 1);
              const height = (day.count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary rounded-t hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${day.date}: ${day.count} leads`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
