'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  HeartHandshake, TrendingUp, TrendingDown, AlertTriangle,
  Shield, RefreshCw, MessageSquare, Activity,
} from 'lucide-react';

// ── Helpers ──

const getScoreColor = (score: number) => {
  if (score >= 70) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
};

const getScoreBg = (score: number) => {
  if (score >= 70) return 'bg-emerald-50';
  if (score >= 50) return 'bg-amber-50';
  return 'bg-red-50';
};

const getScoreRing = (score: number) => {
  if (score >= 70) return 'stroke-emerald-500';
  if (score >= 50) return 'stroke-amber-500';
  return 'stroke-red-500';
};

// ── Skeleton ──

function SkeletonScore() {
  return (
    <div className="rounded-2xl p-8 bg-gray-50 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-3">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-16 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-36 bg-gray-200 rounded" />
        </div>
        <div className="h-16 w-16 bg-gray-200 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
          <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
          <div className="h-8 w-20 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Gauge Component ──

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={getScoreRing(score)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</span>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function ReputationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [overviewRes] = await Promise.all([
        api.get<any>('/api/reputation/overview'),
      ]);
      if (overviewRes.success && overviewRes.data) setData(overviewRes.data);
    } catch {
      toast.error('Failed to load reputation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reputation Dashboard</h1>
          <p className="text-gray-500 mt-1">Monitor brand sentiment and manage risks</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <>
          <SkeletonScore />
          <SkeletonGrid />
        </>
      ) : data ? (
        <>
          {/* Main reputation score */}
          <div className={`rounded-2xl p-8 ${getScoreBg(data.reputationScore)} transition-colors`}>
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <p className={`text-sm font-medium ${getScoreColor(data.reputationScore)}`}>
                  Reputation Score
                </p>
                <p className={`text-5xl font-bold mt-2 ${getScoreColor(data.reputationScore)}`}>
                  {data.reputationScore}
                  <span className="text-xl font-normal opacity-60">/100</span>
                </p>
                <div className="flex items-center gap-1.5 mt-3">
                  {data.trend > 0 ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-full">
                      <TrendingUp size={14} /> +{data.trend}
                    </span>
                  ) : data.trend < 0 ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-red-600 bg-red-100/50 px-2 py-0.5 rounded-full">
                      <TrendingDown size={14} /> {data.trend}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">No change from last week</span>
                  )}
                </div>
              </div>
              <ScoreGauge score={data.reputationScore} />
            </div>
          </div>

          {/* Sentiment breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SentimentCard
              label="Positive"
              percent={data.positivePercent}
              count={data.positive}
              color="emerald"
              icon={TrendingUp}
            />
            <SentimentCard
              label="Neutral"
              percent={data.neutralPercent}
              count={data.neutral}
              color="gray"
              icon={MessageSquare}
            />
            <SentimentCard
              label="Negative"
              percent={data.negativePercent}
              count={data.negative}
              color="red"
              icon={TrendingDown}
            />
            <SentimentCard
              label="Crisis Alerts"
              percent={data.crisis}
              count={data.openEscalations}
              color="rose"
              icon={AlertTriangle}
              isCrisis
            />
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Interactions" value={data.totalInteractions} icon={Activity} />
            <MetricCard label="Active Alerts" value={data.activeAlerts} icon={AlertTriangle} color="amber" />
            <MetricCard label="Open Escalations" value={data.openEscalations} icon={Shield} color="orange" />
            <MetricCard label="Negative" value={data.negative} icon={TrendingDown} color="red" />
          </div>

          {/* Active alerts */}
          {data.recentAlerts && data.recentAlerts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={18} className="text-red-500" />
                <h2 className="font-semibold text-gray-900">Active Reputation Alerts</h2>
              </div>
              <div className="space-y-3">
                {data.recentAlerts.map((alert: any, idx: number) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100 animate-in fade-in slide-in-from-bottom-1"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <Shield size={16} className="text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          alert.severity === 'critical' ? 'bg-red-100 text-red-700 ring-1 ring-red-200/30' :
                          alert.severity === 'high' ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200/30' :
                          'bg-amber-100 text-amber-700 ring-1 ring-amber-200/30'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="text-xs text-gray-500">{alert.reason}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{alert.context}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(alert.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {data.totalInteractions === 0 && (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
              <HeartHandshake size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No data yet</h3>
              <p className="text-gray-500 mt-1">
                Reputation data will appear once your AI starts interacting with customers
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Sub-components ──

function SentimentCard({
  label, percent, count, color, icon: Icon, isCrisis,
}: {
  label: string; percent: number; count: number;
  color: string; icon: any; isCrisis?: boolean;
}) {
  const colorMap: Record<string, { text: string; bg: string; border: string }> = {
    emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    gray: { text: 'text-gray-600', bg: 'bg-white', border: 'border-gray-100' },
    red: { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    rose: { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-100' },
  };
  const c = colorMap[color] || colorMap.gray;

  return (
    <div className={`${c.bg} rounded-xl border ${c.border} p-5 transition-all hover:shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-sm font-medium ${isCrisis ? c.text : 'text-gray-500'}`}>
          {isCrisis ? count : `${percent}%`}
        </p>
        <Icon size={16} className={c.text} />
      </div>
      <p className={`text-2xl font-bold ${isCrisis ? 'text-red-700' : c.text}`}>
        {isCrisis ? percent : label}
      </p>
      {!isCrisis && (
        <p className="text-xs text-gray-400 mt-1">{count} interactions</p>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color = 'gray' }: {
  label: string; value: number; icon: any; color?: string;
}) {
  const colors: Record<string, string> = {
    gray: 'text-gray-900',
    amber: 'text-amber-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 transition-all hover:shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-400" />
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-xl font-bold ${colors[color] || colors.gray}`}>{value}</p>
    </div>
  );
}

