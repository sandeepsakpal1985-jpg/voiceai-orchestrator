import { Shield, Lock, Globe, Cpu, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const TRUST_ITEMS = [
  { icon: Lock, label: 'Secure OAuth', desc: 'Industry-standard token encryption' },
  { icon: Shield, label: 'GDPR Ready', desc: 'Privacy-first data handling' },
  { icon: Sparkles, label: 'Encrypted Data', desc: 'At rest and in transit' },
  { icon: Globe, label: 'Meta API Integration', desc: 'Official Instagram & Facebook APIs' },
  { icon: Cpu, label: 'OpenAI Powered', desc: 'Enterprise-grade AI responses' },
];

interface TrustStripProps {
  variant?: 'default' | 'compact' | 'footer';
  className?: string;
}

export default function TrustStrip({ variant = 'default', className }: TrustStripProps) {
  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-wrap items-center justify-center gap-4', className)}>
        {TRUST_ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <Icon size={14} className="text-accent-500" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className={cn('py-12 lg:py-16', className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {variant === 'footer' ? (
          <p className="text-center text-xs text-gray-400 mb-6">
            Built for trust — not affiliated with or endorsed by Meta Platforms, Inc.
          </p>
        ) : (
          <p className="text-center text-sm font-medium text-gray-500 mb-8">
            Enterprise-grade security &amp; compliance
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {TRUST_ITEMS.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex flex-col items-center text-center p-4 rounded-xl border border-gray-100 bg-white/50 hover:border-primary-100 hover:shadow-brand transition-all"
            >
              <div className="p-2.5 rounded-lg bg-primary-50 mb-3">
                <Icon size={20} className="text-primary-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
