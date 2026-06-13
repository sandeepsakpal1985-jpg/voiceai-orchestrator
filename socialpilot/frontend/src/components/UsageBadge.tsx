'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Zap, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface BadgeData {
  plan: string;
  planName: string;
  metrics: Array<{
    key: string;
    label: string;
    used: number;
    limit: number;
    percentage: number;
    warning: string;
  }>;
}

export default function UsageBadge() {
  const [data, setData] = useState<BadgeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: BadgeData }>('/api/subscription/usage').then((res) => {
      if (res.success && res.data?.data) setData(res.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-2 border-t border-gray-100">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" />
          Loading usage...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const aiMetric = data.metrics.find((m) => m.key === 'ai_responses');
  if (!aiMetric) return null;

  const isUnlimited = aiMetric.limit >= 999999;
  const isExceeded = aiMetric.warning === 'exceeded';
  const isWarning = aiMetric.warning === 'warning_90' || aiMetric.warning === 'warning_80';
  const barColor = isExceeded ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-primary';

  return (
    <Link href="/billing" className="block px-4 py-3 border-t border-gray-100 hover:bg-gray-50 transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-primary-50 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary uppercase">{data.plan.slice(0, 2)}</span>
          </div>
          <span className="text-xs font-semibold text-gray-900 capitalize group-hover:text-primary transition-colors">
            {data.planName} Plan
          </span>
        </div>
        {isExceeded && <AlertTriangle size={12} className="text-red-500" />}
        {!isExceeded && <Zap size={12} className="text-gray-400 group-hover:text-primary transition-colors" />}
      </div>
      {!isUnlimited && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>AI Replies</span>
            <span>{aiMetric.used} / {aiMetric.limit}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.min(aiMetric.percentage, 100)}%` }}
            />
          </div>
        </div>
      )}
      {isUnlimited && (
        <p className="text-[10px] text-gray-500">Unlimited AI replies</p>
      )}
    </Link>
  );
}
