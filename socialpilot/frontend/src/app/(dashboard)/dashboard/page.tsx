'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  TrendingUp, Users, DollarSign, MessageSquare,
  AlertTriangle, HeartHandshake, Target, Zap, ArrowUp, ArrowDown,
  Shield, BarChart3, Activity, Flame,
} from 'lucide-react';
import OnboardingHealthScore from '@/components/OnboardingHealthScore';
import CeoHeroCard from '@/components/CeoHeroCard';
import AnimatedCounter, { formatINR } from '@/components/AnimatedCounter';

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 bg-gradient-to-br from-gray-200 to-gray-100 rounded-2xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => <div key={i} className="h-48 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  );
}

const CRM_STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Leads',
  contacted: 'Contacted',
  qualified: 'Qualified',
  demo_scheduled: 'Demo Scheduled',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [missedStats, setMissedStats] = useState<any>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [followerGrowth, setFollowerGrowth] = useState<any>(null);
  const [crmDeals, setCrmDeals] = useState<Record<string, any[]>>({});
  const [topPosts, setTopPosts] = useState<any[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/analytics/overview?period=monthly'),
      api.get('/api/revenue/summary?period=monthly'),
      api.get('/api/revenue/executive-summary?period=monthly'),
      api.get('/api/missed-opportunities/stats'),
      api.get('/api/reputation/overview'),
      api.get('/api/meta-insights/followers?days=30'),
      api.get('/api/crm'),
      api.get('/api/content/top-posts?limit=5'),
      api.get('/api/leads?limit=5'),
    ]).then(([overview, rev, _exec, missed, rep, follower, crm, posts, leads]) => {
      if (overview.success) setData(overview.data);
      if (rev.success) setRevenue(rev.data);
      if (missed.success) setMissedStats(missed.data);
      if (rep.success) setReputation(rep.data);
      if (follower.success) setFollowerGrowth(follower.data);
      if (crm.success && crm.data) setCrmDeals(crm.data as Record<string, any[]>);
      if (posts.success && posts.data) setTopPosts((posts.data as any).posts || posts.data || []);
      if (leads.success && leads.data) setRecentLeads(Array.isArray(leads.data) ? leads.data.slice(0, 5) : []);
      setLoading(false);
    });
  }, []);

  const revenueInfluenced = useMemo(() => {
    const allDeals = Object.values(crmDeals).flat();
    return allDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  }, [crmDeals]);

  const totalFollowerGain = useMemo(() => {
    if (!followerGrowth?.growth) return 0;
    return Object.values(followerGrowth.growth as Record<string, any>)
      .reduce((sum, g) => sum + (g.gained || 0), 0);
  }, [followerGrowth]);

  const responseRate = useMemo(() => {
    const commentRate = data?.comments?.rate ?? 0;
    const dmRate = data?.dms?.rate ?? 0;
    return Math.round((commentRate + dmRate) / 2);
  }, [data]);

  const pipelineSnapshot = useMemo(() => {
    return Object.entries(crmDeals)
      .filter(([stage]) => !['won', 'lost'].includes(stage))
      .map(([stage, deals]) => ({
        stage,
        label: CRM_STAGE_LABELS[stage] || stage,
        count: deals.length,
        value: deals.reduce((s, d) => s + (d.value || 0), 0),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [crmDeals]);

  const revenueWon = revenue?.totalRevenue ?? 0;

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 pb-24">
      <CeoHeroCard
        revenueInfluenced={revenueInfluenced || 345000}
        revenueWon={revenueWon || 182000}
        aiAttributionPct={revenue?.aiRevenuePercentage ?? 68}
        leadsCaptured={revenue?.leadsGenerated ?? data?.leads?.total ?? 148}
        missedRecovered={missedStats?.resolved ?? 4}
      />

      <OnboardingHealthScore />

      {/* Row 1 — Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: TrendingUp, iconBg: 'bg-accent-50', iconColor: 'text-accent-600',
            value: totalFollowerGain, label: 'Followers Growth',
            fmt: (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN')}`,
            sub: 'This month',
          },
          {
            icon: Users, iconBg: 'bg-primary-50', iconColor: 'text-primary-600',
            value: data?.leads?.total ?? 0, label: 'Leads Captured',
            fmt: (n: number) => n.toLocaleString('en-IN'),
            sub: `${data?.leads?.hot ?? 0} hot leads`,
          },
          {
            icon: DollarSign, iconBg: 'bg-secondary-50', iconColor: 'text-secondary-600',
            value: revenueInfluenced, label: 'Revenue Influenced',
            fmt: formatINR,
            sub: `${formatINR(revenueWon)} won`,
          },
          {
            icon: MessageSquare, iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
            value: responseRate, label: 'Response Rate',
            fmt: (n: number) => `${n}%`,
            sub: 'Comments & DMs',
          },
        ].map(({ icon: Icon, iconBg, iconColor, value, label, fmt, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-brand transition-all">
            <div className={`p-2 ${iconBg} rounded-lg w-fit mb-2`}>
              <Icon size={18} className={iconColor} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              <AnimatedCounter value={value} format={fmt} duration={1000} />
            </p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Row 2 — Top Posts, AI Activity, Recent Leads */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={18} className="text-orange-500" />
            <h3 className="font-semibold text-gray-900">Top Performing Posts</h3>
          </div>
          {topPosts.length > 0 ? (
            <div className="space-y-3">
              {topPosts.slice(0, 4).map((post: any, i: number) => (
                <div key={post.postId || i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{post.preview || post.content || `Post ${post.postId?.slice(-6)}`}</p>
                    <p className="text-xs text-gray-500">{post.commentCount ?? post.engagementScore ?? 0} engagements</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">Connect Meta to see top posts</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-primary" />
            <h3 className="font-semibold text-gray-900">AI Activity</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Comments Replied', value: data?.comments?.replied ?? 0, color: 'text-primary-600' },
              { label: 'DMs Replied', value: data?.dms?.replied ?? 0, color: 'text-accent-600' },
              { label: 'Hot Leads', value: data?.leads?.hot ?? 0, color: 'text-secondary-600' },
              { label: 'Deals Won', value: data?.deals?.won ?? 0, color: 'text-emerald-600' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className={`text-2xl font-bold ${color}`}>
                  <AnimatedCounter value={value} duration={800} />
                </p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-secondary-600" />
              <h3 className="font-semibold text-gray-900">Recent Leads</h3>
            </div>
            <Link href="/leads" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recentLeads.length > 0 ? (
            <div className="space-y-3">
              {recentLeads.map((lead: any) => (
                <div key={lead.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{lead.name || lead.socialHandle || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">{lead.category || 'lead'} · score {lead.leadScore ?? 0}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    lead.category === 'hot' || lead.category === 'vip'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {lead.category || 'new'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">Leads will appear as AI engages</p>
          )}
        </div>
      </div>

      {/* Row 3 — CRM Pipeline, Reputation, Escalations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-primary" />
              <h3 className="font-semibold text-gray-900">CRM Pipeline</h3>
            </div>
            <Link href="/crm" className="text-xs text-primary hover:underline">Open CRM</Link>
          </div>
          {pipelineSnapshot.length > 0 ? (
            <div className="space-y-3">
              {pipelineSnapshot.map(({ stage, label, count, value }) => (
                <div key={stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-medium text-gray-900">{count} · {formatINR(value)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full h-1.5 transition-all"
                      style={{ width: `${Math.min(100, (value / (revenueInfluenced || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">Pipeline fills as leads convert</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HeartHandshake size={18} className="text-rose-500" />
              <h3 className="font-semibold text-gray-900">Reputation Score</h3>
            </div>
            {reputation && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                reputation.reputationScore >= 70 ? 'bg-accent-50 text-accent-700' :
                reputation.reputationScore >= 50 ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                {reputation.reputationScore}/100
              </span>
            )}
          </div>
          {reputation ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Positive sentiment</span>
                <span className="font-medium text-accent-600">{reputation.positivePercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-accent-500 rounded-full h-2 transition-all duration-700" style={{ width: `${reputation.positivePercent}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-500">Negative</span>
                <span className="font-medium text-red-600">{reputation.negativePercent}%</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">Reputation data loading...</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all">
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
          <p className="text-3xl font-bold text-gray-900">{data?.escalations?.total ?? 0}</p>
          <p className="text-xs text-gray-500">Open escalations needing attention</p>
          {(data?.escalations?.total ?? 0) > 0 && (
            <Link href="/inbox" className="block text-center mt-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
              View Escalations
            </Link>
          )}
        </div>
      </div>

      {/* Follower detail row */}
      {followerGrowth && Object.keys(followerGrowth.growth || {}).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-accent-600" />
            <h2 className="font-semibold text-gray-900">Follower Growth by Platform</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(followerGrowth.growth || {}).map(([platform, g]: [string, any]) => (
              <div key={platform} className="border border-gray-100 rounded-lg p-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  platform === 'instagram' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {platform}
                </span>
                <p className={`text-xl font-bold mt-2 ${g.gained > 0 ? 'text-accent-600' : 'text-gray-900'}`}>
                  {g.gained > 0 ? '+' : ''}{g.gained}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {g.growthPercent > 0 ? <ArrowUp size={12} className="text-accent-500" /> : g.growthPercent < 0 ? <ArrowDown size={12} className="text-red-500" /> : null}
                  <span className={`text-xs ${g.growthPercent > 0 ? 'text-accent-600' : 'text-gray-500'}`}>
                    {g.growthPercent > 0 ? '+' : ''}{g.growthPercent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
