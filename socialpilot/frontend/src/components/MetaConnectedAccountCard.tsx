'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Instagram, Facebook, CheckCircle, AlertTriangle, RefreshCw,
  Users, Clock, Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetaConnection {
  id: string;
  facebookPageId?: string | null;
  facebookPageName?: string | null;
  instagramAccountId?: string | null;
  instagramUsername?: string | null;
  status: string;
  connectedAt: string;
  updatedAt: string;
  tokenExpiresAt: string;
}

interface FollowerData {
  current?: Record<string, { followers: number }>;
}

function HealthBadge({ status, tokenExpiresAt }: { status: string; tokenExpiresAt: string }) {
  const daysLeft = Math.ceil((new Date(tokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (status !== 'active' || daysLeft <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
        <AlertTriangle size={12} /> Needs attention
      </span>
    );
  }
  if (daysLeft <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
        <Clock size={12} /> Token expires in {daysLeft}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-accent-50 text-accent-700">
      <CheckCircle size={12} /> Healthy
    </span>
  );
}

export default function MetaConnectedAccountCard({ className }: { className?: string }) {
  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [followers, setFollowers] = useState<FollowerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [connRes, followerRes] = await Promise.all([
      api.get<MetaConnection[]>('/api/meta/connections'),
      api.get<FollowerData>('/api/meta-insights/followers?days=7'),
    ]);
    if (connRes.success && connRes.data) setConnections(connRes.data);
    if (followerRes.success && followerRes.data) setFollowers(followerRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async (id: string) => {
    setRefreshing(true);
    await api.post(`/api/meta/connections/${id}/refresh`);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className={cn('animate-pulse bg-gray-100 rounded-2xl h-40', className)} />
    );
  }

  if (connections.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {connections.map((conn) => {
        const hasIg = !!conn.instagramAccountId;
        const hasFb = !!conn.facebookPageId;
        const accountName = conn.facebookPageName || conn.instagramUsername || 'Connected Account';
        const igFollowers = followers?.current?.instagram?.followers;
        const fbFollowers = followers?.current?.facebook?.followers;

        return (
          <div
            key={conn.id}
            className="relative overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-primary-50/30 p-5 shadow-sm hover:shadow-brand transition-shadow"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary-100/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />

            <div className="relative flex items-start gap-4">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white font-bold text-xl shadow-brand">
                  {accountName.charAt(0).toUpperCase()}
                </div>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-accent-500 rounded-full border-2 border-white flex items-center justify-center">
                  <Wifi size={10} className="text-white" />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">{accountName}</h3>
                  <HealthBadge status={conn.status} tokenExpiresAt={conn.tokenExpiresAt} />
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  {hasIg && (
                    <span className="inline-flex items-center gap-1">
                      <Instagram size={14} className="text-pink-500" />
                      @{conn.instagramUsername}
                    </span>
                  )}
                  {hasFb && (
                    <span className="inline-flex items-center gap-1">
                      <Facebook size={14} className="text-blue-600" />
                      {conn.facebookPageName}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {hasIg && igFollowers != null && (
                    <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Users size={12} /> IG Followers
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{igFollowers.toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  {hasFb && fbFollowers != null && (
                    <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Users size={12} /> FB Followers
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{fbFollowers.toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={12} /> Last sync
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(conn.updatedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2 border border-gray-100">
                    <div className="text-xs text-gray-500">Status</div>
                    <p className="text-sm font-semibold text-accent-600 capitalize">{conn.status}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleRefresh(conn.id)}
                disabled={refreshing}
                className="shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-white text-gray-500 hover:text-primary-600 transition-colors disabled:opacity-50"
                title="Refresh connection"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
