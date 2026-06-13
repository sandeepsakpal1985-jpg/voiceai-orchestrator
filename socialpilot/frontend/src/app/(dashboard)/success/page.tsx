'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import CustomerSuccessScore, { TrendBadge } from '@/components/CustomerSuccessScore';
import SuccessMilestones from '@/components/SuccessMilestones';
import SuccessRecommendations from '@/components/SuccessRecommendations';
import {
  Loader2, Trophy, MessageSquare, Users, DollarSign,
  Zap, TrendingUp, BarChart3,
} from 'lucide-react';

export default function SuccessPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/customer-success/dashboard').then((res: any) => {
      if (res.success) setData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <Trophy size={48} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Unable to load success dashboard.</p>
      </div>
    );
  }

  const { successScore, scoreBreakdown, summary, milestones, recommendations, trends, metrics } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customer Success</h1>
        <p className="text-sm text-gray-500 mt-1">How well your AI sales agent is performing for your business</p>
      </div>

      {/* Summary card */}
      <div className="bg-gradient-to-br from-primary to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={20} />
          <span className="font-semibold">Success Summary</span>
        </div>
        <p className="text-white/90 leading-relaxed">{summary}</p>
      </div>

      {/* Success Score + Quick Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CustomerSuccessScore score={successScore} breakdown={scoreBreakdown} />
        </div>

        {/* Quick metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-shadow">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-1.5">
              <MessageSquare size={16} className="text-blue-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{metrics.commentReplyRate}%</p>
            <p className="text-[10px] text-gray-500">Reply Rate</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-shadow">
            <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center mx-auto mb-1.5">
              <Users size={16} className="text-purple-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{metrics.hotLeads}</p>
            <p className="text-[10px] text-gray-500">Hot Leads</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-shadow">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center mx-auto mb-1.5">
              <DollarSign size={16} className="text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">₹{(metrics.totalRevenue / 1000).toFixed(1)}k</p>
            <p className="text-[10px] text-gray-500">Revenue</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-md transition-shadow">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center mx-auto mb-1.5">
              <Zap size={16} className="text-amber-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">{metrics.pendingApprovals}</p>
            <p className="text-[10px] text-gray-500">Approvals</p>
          </div>
        </div>
      </div>

      {/* Trends + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trends */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Weekly Trends</h2>
          </div>
          <div className="space-y-3">
            {trends.map((trend: any) => (
              <div key={trend.key} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{trend.label}</p>
                  <p className="text-xs text-gray-500">
                    {trend.current} this week vs {trend.previous} last week
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">{trend.current}</span>
                  <TrendBadge
                    value={Math.abs(trend.current - trend.previous)}
                    direction={trend.direction}
                  />
                </div>
              </div>
            ))}
            {trends.every((t: any) => t.current === 0 && t.previous === 0) && (
              <div className="text-center py-6">
                <BarChart3 size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No data yet this week</p>
              </div>
            )}
          </div>
        </div>

        {/* Recommendations */}
        <SuccessRecommendations recommendations={recommendations} />
      </div>

      {/* Milestones */}
      <SuccessMilestones milestones={milestones} />

      {/* Key Metrics Grid */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-primary" />
          <h2 className="font-semibold text-gray-900">All Metrics</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Total Leads</p>
            <p className="text-lg font-bold text-gray-900">{metrics.totalLeads}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Comments</p>
            <p className="text-lg font-bold text-gray-900">{metrics.totalComments}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">DMs</p>
            <p className="text-lg font-bold text-gray-900">{metrics.totalDms}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Deals Won</p>
            <p className="text-lg font-bold text-gray-900">{metrics.wonDeals}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">AI Revenue</p>
            <p className="text-lg font-bold text-gray-900">₹{(metrics.aiRevenue / 1000).toFixed(1)}k</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Open Escalations</p>
            <p className="text-lg font-bold text-red-600">{metrics.openEscalations}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Missed Opportunities</p>
            <p className="text-lg font-bold text-amber-600">{metrics.openMissed}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">DM Resolve Rate</p>
            <p className="text-lg font-bold text-gray-900">{metrics.dmResolveRate}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
