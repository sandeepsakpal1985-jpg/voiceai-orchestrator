'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';

interface DemoContextType {
  isDemo: boolean;
  companyName: string | null;
  loading: boolean;
}

const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  companyName: null,
  loading: true,
});

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check demo status on mount (only if authenticated)
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    api.get<{ demo: boolean; companyName: string | null }>('/api/demo/status')
      .then((res) => {
        if (res.success && res.data) {
          setIsDemo(res.data.demo);
          setCompanyName(res.data.companyName || null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <DemoContext.Provider value={{ isDemo, companyName, loading }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  return useContext(DemoContext);
}

// ── Demo Badge Component ──

export function DemoBadge() {
  const { isDemo, loading } = useDemo();

  if (loading || !isDemo) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1.5 rounded-full shadow-lg text-xs font-medium">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      Demo Mode — Elite Dental Clinic
    </div>
  );
}
