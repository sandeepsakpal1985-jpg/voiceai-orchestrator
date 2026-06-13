'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoreBreakdown {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  weight: string;
  description: string;
}

interface CustomerSuccessScoreProps {
  score: number;
  breakdown: ScoreBreakdown[];
}

export default function CustomerSuccessScore({ score, breakdown }: CustomerSuccessScoreProps) {
  const scoreColor =
    score >= 80 ? 'text-emerald-600' :
    score >= 50 ? 'text-amber-600' :
    'text-red-600';

  const strokeColor =
    score >= 80 ? 'stroke-emerald-500' :
    score >= 50 ? 'stroke-amber-500' :
    'stroke-red-500';

  const bgColor =
    score >= 80 ? 'bg-emerald-50 border-emerald-200' :
    score >= 50 ? 'bg-amber-50 border-amber-200' :
    'bg-red-50 border-red-200';

  const label =
    score >= 80 ? 'Excellent' :
    score >= 50 ? 'Good' :
    'Needs Work';

  return (
    <div className={`rounded-xl border ${bgColor} p-6`}>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Main score gauge */}
        <div className="relative w-28 h-28 shrink-0">
          <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
              className="text-gray-200" />
            <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
              className={strokeColor}
              strokeDasharray={`${Math.min(score, 100) * 0.97} 100`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s ease-in-out' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${scoreColor}`}>{score}</span>
            <span className="text-[10px] text-gray-500 font-medium">{label}</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 w-full space-y-2.5">
          {breakdown.map((item) => (
            <div key={item.key} className="group">
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-600 font-medium truncate group-hover:text-gray-900 transition-colors">
                  {item.label}
                  <span className="text-gray-400 ml-1 text-[10px]">({item.weight})</span>
                </span>
                <span className="font-semibold text-gray-900">{Math.min(item.score, 100)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    item.score >= 80 ? 'bg-emerald-500' :
                    item.score >= 50 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(item.score, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TrendBadge({ value, direction }: { value: number; direction: 'up' | 'down' | 'stable' }) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp size={12} />
        +{value}
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <TrendingDown size={12} />
        -{value}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
      <Minus size={12} />
      {value}
    </span>
  );
}
