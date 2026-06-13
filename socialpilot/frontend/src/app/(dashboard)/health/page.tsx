'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, CheckCircle, RefreshCw, Clock, Activity, Wifi, WifiOff, Server, Shield } from 'lucide-react';

type AlertItem = {
  severity: 'critical' | 'warning' | 'info';
  message: string;
};

type ConnectionHealth = {
  id: string;
  platform: 'instagram' | 'facebook';
  pageName: string | null;
  instagramUsername: string | null;
  status: string;
  tokenExpiresAt: string;
  tokenDaysRemaining: number;
  tokenExpired: boolean;
  tokenExpiringSoon: boolean;
};

type WebhookHealth = {
  total: number;
  last24h: number;
  last7d: number;
  successRate: number;
  errorRate: number;
  lastReceivedAt: string | null;
  active: boolean;
};

type ErrorSummary = {
  count: number;
  lastError: string | null;
  lastErrorAt: string | null;
  recentErrors: Array<{ message: string; time: string }>;
};

type HealthData = {
  overallScore: number;
  alerts: AlertItem[];
  connections: ConnectionHealth[];
  webhooks: WebhookHealth;
  errors: ErrorSummary;
  lastChecked: string;
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="70" cy="70" r="54"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-500">health</span>
      </div>
    </div>
  );
}

function TokenBadge({ days }: { days: number }) {
  if (days <= 0) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Expired</span>;
  if (days <= 7) return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">{days}d left</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">{days}d left</span>;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <Icon size={18} style={{ color }} />
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<any>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    const res = await api.get<any>('/api/meta-health/overview');
    if (res.success) {
      setData(res.data);
    } else {
      setError(res.error || 'Failed to load health data');
    }
    setLoading(false);
  };

  const runCheck = async () => {
    setChecking(true);
    setCheckResults(null);
    const res = await api.post<any>('/api/meta-health/check');
    setCheckResults(res);
    setChecking(false);
    if (res.success) fetchHealth();
  };

  useEffect(() => { fetchHealth(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
          <div>
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-32 bg-gray-200 rounded mt-1 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <AlertTriangle size={48} className="mx-auto text-red-400 mb-4" />
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchHealth} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meta Health</h1>
            <p className="text-sm text-gray-500">Last checked: {new Date(data.lastChecked).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runCheck}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Run Health Check'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-4 rounded-lg border ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : alert.severity === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Check Results */}
      {checkResults?.success && checkResults.data && (
        <div className={`p-4 rounded-lg border ${
          checkResults.data.allOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <p className="text-sm font-medium mb-2">
            {checkResults.data.allOk ? '✅ All connections reachable' : '⚠️ Some connections have issues'}
          </p>
          <div className="space-y-1">
            {checkResults.data.results.map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                {r.reachable
                  ? <CheckCircle size={14} className="text-emerald-500" />
                  : <AlertTriangle size={14} className="text-red-500" />
                }
                <span>{r.pageName || r.platform}</span>
                {!r.reachable && <span className="text-red-600">— {r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-center">
          <ScoreGauge score={data.overallScore} />
        </div>
        <StatCard label="Webhooks (24h)" value={data.webhooks.last24h} sub={`${data.webhooks.last7d} in 7 days`} icon={Server} color="#6366f1" />
        <StatCard label="Success Rate" value={`${data.webhooks.successRate}%`} sub={`${data.webhooks.errorRate}% error rate`} icon={Shield} color="#10b981" />
        <StatCard label="Connections" value={data.connections.length} sub={data.connections.filter(c => c.status === 'active').length + ' active'} icon={Wifi} color="#3b82f6" />
        <StatCard label="Errors" value={data.errors.count} sub={data.errors.lastError ? 'Recent: ' + data.errors.lastError.substring(0, 30) + '...' : 'No errors'} icon={AlertTriangle} color="#ef4444" />
      </div>

      {/* Connections */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Meta Connections</h2>
        </div>
        {data.connections.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <WifiOff size={32} className="mx-auto mb-2" />
            <p className="text-sm">No Meta connections configured</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.connections.map((conn) => (
              <div key={conn.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    conn.status === 'active' ? 'bg-emerald-500' : conn.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {conn.pageName || conn.instagramUsername || conn.platform}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{conn.platform}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock size={12} />
                    <span>Expires {new Date(conn.tokenExpiresAt).toLocaleDateString()}</span>
                  </div>
                  <TokenBadge days={conn.tokenDaysRemaining} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Errors */}
      {data.errors.count > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Webhook Errors</h2>
            <span className="text-xs text-gray-500">Last 10 of {data.errors.count}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {data.errors.recentErrors.map((err, i) => (
              <div key={i} className="p-3">
                <p className="text-sm text-red-600 font-mono text-xs">{err.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(err.time).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No webhooks state */}
      {data.webhooks.total === 0 && data.connections.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <Server size={32} className="mx-auto text-blue-400 mb-2" />
          <p className="text-sm text-blue-800 font-medium">Waiting for webhooks</p>
          <p className="text-xs text-blue-600 mt-1">
            Your Meta connection is set up. Webhook data will appear here once interactions are received.
          </p>
        </div>
      )}
    </div>
  );
}
