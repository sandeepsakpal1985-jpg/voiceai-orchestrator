'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Beaker, RefreshCw, Loader2, CheckCircle, X } from 'lucide-react';

export default function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get<any>('/api/demo/status').then((res) => {
      if (res.success && res.data?.demo) {
        setIsDemo(true);
        setCompanyName(res.data.companyName || 'Elite Dental Clinic');
      }
    }).catch(() => {});
  }, []);

  const handleRegenerate = async () => {
    setRegenerating(true);
    const res = await api.post('/api/demo/regenerate');
    if (res.success) {
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    }
    setRegenerating(false);
  };

  if (!isDemo || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-b border-amber-200/50">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Beaker size={14} className="text-amber-600" />
          <span className="text-xs text-amber-800 font-medium">
            🧪 Demo Mode — {companyName}
          </span>
          <span className="text-[10px] text-amber-600 ml-1">
            Data resets automatically
          </span>
        </div>
        <div className="flex items-center gap-3">
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
            {regenerating ? 'Regenerating...' : done ? 'Regenerated!' : 'Regenerate Demo Data'}
          </button>
          <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
