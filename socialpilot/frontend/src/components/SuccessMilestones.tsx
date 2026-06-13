'use client';

import {
  UserPlus, Globe, Users, MessageSquare, BookOpen, Target,
  Trophy, DollarSign, UserCheck, Zap,
} from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  'user-plus': <UserPlus size={16} />,
  'globe': <Globe size={16} />,
  'users': <Users size={16} />,
  'message-square': <MessageSquare size={16} />,
  'book-open': <BookOpen size={16} />,
  'target': <Target size={16} />,
  'trophy': <Trophy size={16} />,
  'dollar-sign': <DollarSign size={16} />,
  'user-check': <UserCheck size={16} />,
  'zap': <Zap size={16} />,
};

interface Milestone {
  key: string;
  label: string;
  achieved: boolean;
  achievedAt?: string;
  icon: string;
}

interface SuccessMilestonesProps {
  milestones: Milestone[];
}

export default function SuccessMilestones({ milestones }: SuccessMilestonesProps) {
  const achieved = milestones.filter(m => m.achieved).length;
  const total = milestones.length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Milestones</h2>
          <p className="text-xs text-gray-500 mt-0.5">{achieved} of {total} completed</p>
        </div>
        <div className="w-16 h-16 relative">
          <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
              className="text-gray-100" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
              className="stroke-primary"
              strokeDasharray={`${(achieved / total) * 97} 100`}
              strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">
            {Math.round((achieved / total) * 100)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {milestones.map((milestone) => (
          <div
            key={milestone.key}
            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
              milestone.achieved
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-gray-50 border-gray-100 opacity-60'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              milestone.achieved
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-gray-200 text-gray-400'
            }`}>
              {iconMap[milestone.icon] || <Zap size={16} />}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-medium truncate ${
                milestone.achieved ? 'text-emerald-800' : 'text-gray-500'
              }`}>
                {milestone.label}
              </p>
              {milestone.achieved && milestone.achievedAt && (
                <p className="text-[10px] text-emerald-500">
                  {new Date(milestone.achievedAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              )}
            </div>
            {milestone.achieved && (
              <span className="ml-auto text-emerald-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
