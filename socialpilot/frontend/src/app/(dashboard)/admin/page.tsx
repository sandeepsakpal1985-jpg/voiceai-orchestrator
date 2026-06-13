'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Shield, Users, Activity, Database, BarChart3,
  Heart, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Server, Wifi, HardDrive,
} from 'lucide-react';

export default function AdminPage() {
  const [usage, setUsage] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'health'>('overview');

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/health'),
    ]).then(([usageRes, healthRes]) => {
      if (usageRes.success) setUsage(usageRes.data);
      if (healthRes.success) setHealth(healthRes.data);
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

  const stats = [
    { label: 'Total Users', value: usage?.users?.total ?? '-', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Connections', value: usage?.connections?.total ?? '-', icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Total Leads', value: usage?.leads?.total ?? '-', icon: Database, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Deals', value: usage?.deals?.total ?? '-', icon: BarChart3, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const healthStatus = health?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={24} className="text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-500 mt-1">System management and monitoring</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('overview')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === 'overview' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab('health')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === 'health' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            System Health
          </button>
        </div>
      </div>

      {tab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className={`p-2 rounded-lg ${stat.bg} w-fit mb-3`}>
                    <Icon size={20} className={stat.color} />
                  </div>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Recent Activity</h2>
            {usage?.recentActivity && usage.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {usage.recentActivity.slice(0, 10).map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-900">{entry.action}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{entry.resourceType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{entry.user?.name || 'Unknown'}</p>
                      <p className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Service Health Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Server size={18} className="text-blue-500" />
                  <span className="font-medium text-gray-900">API Server</span>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700">
                  <CheckCircle size={10} />
                  {healthStatus?.services?.api?.status || 'healthy'}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Uptime: {Math.round(healthStatus?.services?.api?.uptime || 0)}s
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wifi size={18} className="text-purple-500" />
                  <span className="font-medium text-gray-900">Database</span>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-700">
                  <CheckCircle size={10} />
                  {healthStatus?.services?.database?.status || 'connected'}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {healthStatus?.metrics?.totalUsers || 0} users · {healthStatus?.metrics?.totalLeads || 0} leads
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HardDrive size={18} className="text-amber-500" />
                  <span className="font-medium text-gray-900">Queue System</span>
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                  (healthStatus?.metrics?.pendingAiResponses || 0) > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                }`}>
                  <Activity size={10} />
                  {healthStatus?.services?.queue?.status || 'active'}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {healthStatus?.metrics?.pendingAiResponses || 0} pending responses
              </p>
            </div>
          </div>

          {/* Error Monitoring */}
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Error Monitoring</h2>
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                healthStatus?.sentry?.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
              }`}>
                {healthStatus?.sentry?.enabled ? 'Sentry Active' : 'Sentry Disabled'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-600 mb-1">
                  <AlertTriangle size={16} />
                  <span className="text-sm font-medium">Critical Errors</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{healthStatus?.errors?.criticalCount || 0}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-600 mb-1">
                  <Activity size={16} />
                  <span className="text-sm font-medium">Open Escalations</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">{healthStatus?.metrics?.openEscalations || 0}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <Heart size={16} />
                  <span className="text-sm font-medium">Active Connections</span>
                </div>
                <p className="text-2xl font-bold text-blue-700">{healthStatus?.metrics?.activeConnections || 0}</p>
              </div>
            </div>

            {healthStatus?.sentry?.dsnConfigured && !healthStatus?.sentry?.enabled && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                ⚠️ SENTRY_DSN is configured but Sentry failed to initialize. Check server logs.
              </div>
            )}
            {!healthStatus?.sentry?.dsnConfigured && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-500">
                ℹ️ SENTRY_DSN not set. Add to .env to enable error monitoring.
              </div>
            )}
          </div>

          {/* Recent Errors */}
          {healthStatus?.errors?.recentErrors?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Recent Critical Errors</h2>
              <div className="space-y-3">
                {healthStatus.errors.recentErrors.map((err: any) => (
                  <div key={err.id} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{err.reason}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{err.context || 'No context'}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(err.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
