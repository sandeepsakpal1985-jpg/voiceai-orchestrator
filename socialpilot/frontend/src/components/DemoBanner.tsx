'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Beaker, RefreshCw, Loader2, CheckCircle, X, Link2 } from 'lucide-react';

export default function DemoBanner() {
  const router = useRouter();
  const [isDemo, setIsDemo] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get<any>('/api/demo/status').then((res) => {
      if (res.success && res.data?.demo) {
        setIsDemo(true);
      }
    }).catch(() => {});
  }, []);

  const handleRegenerate = async () => {
    setRegenerating(true);
    const res = await api.post('/api/demo/regenerate');
    if (res.success) {
      setDone(true);
      setTimeout(() => {
        setDone(false);
        window.location.reload();
      }, 1500);
    }
    setRegenerating(false);
  };

  if (!isDemo || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-b border-amber-200/50">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Beaker size={14} className="text-amber-600 shrink-0" />
          <span className="text-xs text-amber-800 font-medium truncate">
            You are viewing a demo workspace.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => router.push('/onboarding')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Link2 size={12} />
            Connect My Meta Accounts
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 transition-colors disabled:opacity-50"
          >
            {regenerating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : done ? (
              <CheckCircle size={12} className="text-emerald-600" />
            ) : (
              <RefreshCw size={12} />
            )}
            <span className="hidden sm:inline">
              {regenerating ? 'Regenerating...' : done ? 'Done!' : 'Regenerate Data'}
            </span>
          </button>
          <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
