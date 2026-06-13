'use client';

import { AlertTriangle, Zap, Shield, TrendingUp, Target, Lightbulb, ArrowRight, MessageSquare, DollarSign, Trophy } from 'lucide-react';
import Link from 'next/link';

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  message: string;
  actionLabel: string;
  actionLink: string;
}

interface SuccessRecommendationsProps {
  recommendations: Recommendation[];
}

const categoryIcons: Record<string, React.ReactNode> = {
  'engagement': <MessageSquare size={14} />,
  'revenue': <DollarSign size={14} />,
  'setup': <Zap size={14} />,
  'growth': <TrendingUp size={14} />,
  'sales': <Target size={14} />,
  'support': <Shield size={14} />,
  'reputation': <AlertTriangle size={14} />,
  'conversion': <TrendingUp size={14} />,
  'insight': <Lightbulb size={14} />,
};


const priorityConfig: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  high: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', label: 'High Priority' },
  medium: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', label: 'Medium Priority' },
  low: { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', label: 'Suggestion' },
};

export default function SuccessRecommendations({ recommendations }: SuccessRecommendationsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb size={18} className="text-primary" />
        <h2 className="font-semibold text-gray-900">Recommended Actions</h2>
      </div>

      {recommendations.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <Trophy size={24} className="text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">Everything looks great!</p>
          <p className="text-xs text-gray-500 mt-1">No recommended actions at this time.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {recommendations.map((rec, i) => {
            const config = priorityConfig[rec.priority];
            const Icon = categoryIcons[rec.category] || <Lightbulb size={14} />;
            return (
              <div
                key={i}
                className={`${config.bg} ${config.border} border rounded-lg p-3 transition-all hover:shadow-sm`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                    <span className="text-[10px] font-medium text-gray-500 uppercase">{rec.category}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-relaxed">{rec.message}</p>
                    <Link
                      href={rec.actionLink}
                      className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {rec.actionLabel}
                      <ArrowRight size={10} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
