'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  AlertTriangle, RefreshCw, DollarSign, User, MessageSquare,
  Target, Eye, CheckCircle, XCircle,
} from 'lucide-react';

// ── Constants ──

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  pricing_unanswered: { label: 'Pricing Unanswered', icon: DollarSign, color: 'text-amber-600 bg-amber-50 ring-1 ring-amber-200/30' },
  purchase_intent_unanswered: { label: 'Purchase Intent Missed', icon: Target, color: 'text-red-600 bg-red-50 ring-1 ring-red-200/30' },
  stalled_conversation: { label: 'Stalled Conversation', icon: MessageSquare, color: 'text-blue-600 bg-blue-50 ring-1 ring-blue-200/30' },
  missed_follow_up: { label: 'Missed Follow-up', icon: User, color: 'text-purple-600 bg-purple-50 ring-1 ring-purple-200/30' },
  unanswered_comment: { label: 'Unanswered Comment', icon: MessageSquare, color: 'text-orange-600 bg-orange-50 ring-1 ring-orange-200/30' },
  ignored_lead: { label: 'Ignored Lead', icon: User, color: 'text-rose-600 bg-rose-50 ring-1 ring-rose-200/30' },
};

// ── Skeleton ──

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-5 bg-gray-200 rounded" />
        <div className="h-4 w-36 bg-gray-200 rounded" />
        <div className="h-4 w-16 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
      <div className="h-8 w-full bg-gray-100 rounded mb-2" />
      <div className="flex gap-3">
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-3 w-16 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// ── Component ──

export default function MissedOpportunitiesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState('open');
  const [detecting, setDetecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const params = filter !== 'all' ? `?status=${filter}` : '';
    try {
      const [itemsRes, statsRes] = await Promise.all([
        api.get<any>(`/api/missed-opportunities${params}`),
        api.get<any>('/api/missed-opportunities/stats'),
      ]);
      if (itemsRes.success && itemsRes.data) setItems(itemsRes.data);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    } catch {
      toast.error('Failed to load missed opportunities');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await api.post('/api/missed-opportunities/detect');
      if (res.success) {
        toast.success('Scan complete! Check for new opportunities.');
      } else {
        toast.error(res.error || 'Scan failed');
      }
    } catch {
      toast.error('Network error during scan');
    } finally {
      setDetecting(false);
      loadData();
    }
  };

  const handleRecover = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await api.post(`/api/missed-opportunities/${id}/recover`);
      if (res.success) {
        toast.success('Lead recovery initiated!');
      } else {
        toast.error(res.error || 'Recovery failed');
      }
    } catch {
      toast.error('Network error during recovery');
    } finally {
      setActionLoading(null);
      loadData();
    }
  };

  const handleStatus = async (id: string, status: string) => {
    setActionLoading(id);
    try {
      const res = await api.put(`/api/missed-opportunities/${id}`, { status });
      if (res.success) {
        toast.success(`Opportunity ${status === 'dismissed' ? 'dismissed' : 'updated'}!`);
      } else {
        toast.error(res.error || 'Update failed');
      }
    } catch {
      toast.error('Network error during update');
    } finally {
      setActionLoading(null);
      loadData();
    }
  };

  const typeInfo = (type: string) => TYPE_CONFIG[type] || { label: type, icon: AlertTriangle, color: 'text-gray-600 bg-gray-50 ring-1 ring-gray-200/30' };

  const FILTERS = ['all', 'open', 'resolved', 'dismissed'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Missed Opportunities</h1>
          <p className="text-gray-500 mt-1">Detect and recover lost revenue opportunities</p>
        </div>
        <button
          onClick={handleDetect}
          disabled={detecting}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary-200/50"
        >
          <RefreshCw size={16} className={detecting ? 'animate-spin' : ''} />
          {detecting ? 'Scanning...' : 'Scan for Opportunities'}
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Open" value={stats.open} color="amber" />
          <StatCard label="Resolved" value={stats.resolved} color="emerald" />
          <StatCard label="Dismissed" value={stats.dismissed} color="gray" />
          <StatCard
            label="Potential Revenue"
            value={stats.totalPotentialValue > 0 ? `₹${stats.totalPotentialValue.toLocaleString('en-IN')}` : '₹0'}
            color="amber"
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              filter === f ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <CheckCircle size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No missed opportunities</h3>
            <p className="text-gray-500 mt-1">
              {filter === 'open'
                ? 'Click "Scan for Opportunities" to detect them'
                : `No ${filter} items yet`}
            </p>
          </div>
        ) : (
          items.map((item: any, idx: number) => {
            const info = typeInfo(item.type);
            const Icon = info.icon;
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all duration-200 animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className={`p-1.5 rounded-lg ${info.color}`}>
                        <Icon size={14} />
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>
                        {info.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.status === 'open' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/30' :
                        item.status === 'resolved' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/30' :
                        'bg-gray-50 text-gray-600 ring-1 ring-gray-200/30'
                      }`}>
                        {item.status}
                      </span>
                      {item.type === 'pricing_unanswered' && (
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200/30">
                          High Value
                        </span>
                      )}
                    </div>

                    <h3 className="font-medium text-gray-900">{item.description}</h3>

                    {item.message && (
                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                        &ldquo;{item.message}&rdquo;
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {item.customerName && (
                        <span className="flex items-center gap-1">
                          <User size={12} /> {item.customerName}
                        </span>
                      )}
                      {item.customerHandle && <span>@{item.customerHandle}</span>}
                      {item.platform && (
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                          {item.platform}
                        </span>
                      )}
                      {item.potentialValue > 0 && (
                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                          <DollarSign size={12} /> {item.potentialValue}
                        </span>
                      )}
                    </div>

                    {item.recommendedAction && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-primary-600">
                        <Eye size={12} className="mt-0.5 shrink-0" />
                        <span>{item.recommendedAction}</span>
                      </div>
                    )}
                  </div>
                </div>

                {item.status === 'open' && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => handleRecover(item.id)}
                      disabled={actionLoading === item.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary-200/50"
                    >
                      {actionLoading === item.id ? <Spinner /> : <User size={14} />}
                      Recover Lead
                    </button>
                    <button
                      onClick={() => handleStatus(item.id, 'dismissed')}
                      disabled={actionLoading === item.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
                    >
                      <XCircle size={14} /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const styles: Record<string, string> = {
    gray: 'bg-white text-gray-900 border-gray-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };
  return (
    <div className={`rounded-xl border p-4 transition-all hover:shadow-sm ${styles[color] || styles.gray}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-70">{label}</p>
    </div>
  );
}

function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />;
}

