'use client';

import AnimatedCounter, { formatINR } from '@/components/AnimatedCounter';
import { TrendingUp, DollarSign, Bot, Users, RotateCcw } from 'lucide-react';

interface CeoHeroCardProps {
  revenueInfluenced: number;
  revenueWon: number;
  aiAttributionPct: number;
  leadsCaptured: number;
  missedRecovered: number;
}

export default function CeoHeroCard({
  revenueInfluenced,
  revenueWon,
  aiAttributionPct,
  leadsCaptured,
  missedRecovered,
}: CeoHeroCardProps) {
  const metrics = [
    {
      label: 'Revenue Influenced',
      value: revenueInfluenced,
      format: formatINR,
      icon: TrendingUp,
      accent: 'text-emerald-300',
    },
    {
      label: 'Revenue Won',
      value: revenueWon,
      format: formatINR,
      icon: DollarSign,
      accent: 'text-white',
    },
    {
      label: 'AI Attribution',
      value: aiAttributionPct,
      format: (n: number) => `${n}%`,
      icon: Bot,
      accent: 'text-violet-300',
    },
    {
      label: 'Leads Captured',
      value: leadsCaptured,
      format: (n: number) => n.toLocaleString('en-IN'),
      icon: Users,
      accent: 'text-blue-300',
    },
    {
      label: 'Opps Recovered',
      value: missedRecovered,
      format: (n: number) => n.toLocaleString('en-IN'),
      icon: RotateCcw,
      accent: 'text-amber-300',
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-6 lg:p-8 text-white shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent" />
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider text-indigo-300">CEO Mode</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">Live</span>
        </div>
        <h2 className="text-xl lg:text-2xl font-bold mb-6">
          How much revenue did KluConnect generate?
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {metrics.map(({ label, value, format, icon: Icon, accent }) => (
            <div
              key={label}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon size={14} className={accent} />
                <span className="text-[11px] text-white/60 font-medium">{label}</span>
              </div>
              <p className="text-xl lg:text-2xl font-bold tabular-nums">
                <AnimatedCounter value={value} format={format} duration={1400} />
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-white/50">
          Elite Dental Clinic · AI-attributed pipeline and closed revenue this month
        </p>
      </div>
    </div>
  );
}
