'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  CheckCircle, Circle, ArrowRight, Loader2,
  AlertTriangle, Target,
} from 'lucide-react';
import Link from 'next/link';

type HealthItem = {
  key: string;
  label: string;
  description: string;
  passed: boolean;
  points: number;
  earned: number;
  actionLabel: string;
  actionLink: string;
};

export default function OnboardingHealthScore() {
  const [score, setScore] = useState(0);
  const [items, setItems] = useState<HealthItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/api/onboarding/health-score').then((res) => {
      if (res.success && res.data) {
        setScore(res.data.score);
        setItems(res.data.items || []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1,2,3,4,5,6,7].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-4 h-4 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-3 flex-1 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const incomplete = items.filter(i => !i.passed);
  const nextAction = incomplete.length > 0 ? incomplete[0] : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-primary" />
            <h3 className="font-semibold text-gray-900 text-sm">Onboarding Health</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-0.5">
              <span className={`text-xl font-bold ${
                score >= 80 ? 'text-emerald-600' :
                score >= 50 ? 'text-amber-600' :
                'text-red-600'
              }`}>
                {score}
              </span>
              <span className="text-xs text-gray-400">/100</span>
            </div>
          </div>
        </div>
        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              score >= 80 ? 'bg-emerald-500' :
              score >= 50 ? 'bg-amber-500' :
              'bg-red-500'
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Next Best Action */}
      {nextAction && (
        <div className="mx-4 mt-3 p-3 bg-primary-50 border border-primary-100 rounded-lg">
          <div className="flex items-start gap-2">
            <ArrowRight size={14} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-primary-800">Next Best Action</p>
              <p className="text-xs text-primary-600 mt-0.5">{nextAction.description}</p>
              <Link
                href={nextAction.actionLink}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-700 mt-1.5"
              >
                {nextAction.actionLabel}
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Checklist */}
      <div className="p-4 space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            {item.passed ? (
              <CheckCircle size={14} className="text-emerald-500 shrink-0" />
            ) : (
              <Circle size={14} className="text-gray-300 shrink-0" />
            )}
            <span className={`text-xs ${item.passed ? 'text-gray-500' : 'text-gray-700'}`}>
              {item.label}
            </span>
            {!item.passed && (
              <Link href={item.actionLink} className="text-[10px] text-primary hover:underline ml-auto">
                {item.actionLabel}
              </Link>
            )}
            {item.passed && (
              <span className="text-[10px] text-emerald-600 ml-auto">{item.earned}/{item.points}</span>
            )}
          </div>
        ))}
      </div>

      {/* Score Perfect */}
      {score === 100 && (
        <div className="p-3 m-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
          <CheckCircle size={16} className="text-emerald-500 mx-auto mb-1" />
          <p className="text-xs font-medium text-emerald-700">All setup steps complete!</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">Your AI sales agent is ready.</p>
        </div>
      )}
    </div>
  );
}
