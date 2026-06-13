'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AlertTriangle, BarChart3, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface UsageMetric {
  key: string;
  label: string;
  used: number;
  limit: number;
  percentage: number;
  warning: 'none' | 'warning_80' | 'warning_90' | 'exceeded';
}

interface UsageData {
  plan: string;
  planName: string;
  periodStart: string;
  periodEnd: string | null;
  metrics: UsageMetric[];
}

export default function UsageLimitBanner() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get<{ data: UsageData }>('/api/subscription/usage').then((res) => {
      if (res.success && res.data?.data) setUsage(res.data.data);
    }).catch(() => {});
  }, []);

  if (!usage || dismissed) return null;

  // Find metrics that are at warning or exceeded level
  const activeWarnings = usage.metrics.filter(
    (m) => m.warning === 'warning_90' || m.warning === 'exceeded' || m.warning === 'warning_80',
  );

  if (activeWarnings.length === 0) return null;

  const exceeded = activeWarnings.filter((m) => m.warning === 'exceeded');
  const warnings = activeWarnings.filter((m) => m.warning !== 'exceeded');
  const isCritical = exceeded.length > 0;

  const colorClass = isCritical
    ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';

  const Icon = isCritical ? X : AlertTriangle;

  return (
    <div className={`mb-6 rounded-lg border p-3 ${colorClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={16} className="shrink-0" />
            <p className="text-sm font-semibold">
              {isCritical
                ? 'Usage limits reached'
                : 'Approaching usage limits'}
            </p>
          </div>
          <div className="mt-1.5 space-y-1">
            {exceeded.map((m) => (
              <p key={m.key} className="text-xs flex items-center gap-1">
                <AlertTriangle size={12} className="shrink-0" />
                <span>
                  <strong>{m.label}</strong> limit reached ({m.used} / {m.limit}).{' '}
                  Some features may be unavailable.
                </span>
              </p>
            ))}
            {warnings.map((m) => (
              <p key={m.key} className="text-xs flex items-center gap-1">
                <BarChart3 size={12} className="shrink-0" />
                <span>
                  <strong>{m.label}:</strong> {m.percentage}% used ({m.used} / {m.limit})
                </span>
              </p>
            ))}
          </div>
          <Link
            href="/billing"
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium hover:underline"
          >
            Upgrade plan
            <ArrowRight size={12} />
          </Link>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-0.5 hover:opacity-70 transition-opacity"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
