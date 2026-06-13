'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Plus, Users, TrendingUp, DollarSign, Target, ArrowRight, BarChart3 } from 'lucide-react';

const STAGES = [
  { key: 'new_lead', label: 'New Lead', color: 'bg-blue-100 text-blue-700' },
  { key: 'contacted', label: 'Contacted', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'qualified', label: 'Qualified', color: 'bg-purple-100 text-purple-700' },
  { key: 'demo_scheduled', label: 'Demo Scheduled', color: 'bg-amber-100 text-amber-700' },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'bg-orange-100 text-orange-700' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-rose-100 text-rose-700' },
  { key: 'won', label: 'Won', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'lost', label: 'Lost', color: 'bg-gray-100 text-gray-700' },
];

const STAGE_LABEL: Record<string, string> = {
  new_lead: 'New Lead', contacted: 'Contacted', qualified: 'Qualified',
  demo_scheduled: 'Demo Scheduled', proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};

export default function CRMPage() {
  const [deals, setDeals] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [revenueStats, setRevenueStats] = useState<any>(null);
  const [funnel, setFunnel] = useState<any>(null);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Record<string, any[]>>('/api/crm'),
      api.get<any>('/api/revenue/summary?period=yearly'),
      api.get<any>('/api/revenue/funnel'),
    ]).then(([dealsRes, revenueRes, funnelRes]) => {
      if (dealsRes.success && dealsRes.data) setDeals(dealsRes.data);
      if (revenueRes.success && revenueRes.data) setRevenueStats(revenueRes.data);
      if (funnelRes.success && funnelRes.data) setFunnel(funnelRes.data);
      setLoading(false);
    });
  }, []);

  const loadTimeline = async (deal: any) => {
    setSelectedDeal(deal);
    setTimelineLoading(true);
    if (deal.leadId) {
      const res = await api.get<any[]>(`/api/timeline/lead/${deal.leadId}`);
      if (res.success && res.data) setTimeline(res.data);
    }
    setTimelineLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Calculate pipeline value
  const activeStages = ['contacted', 'qualified', 'demo_scheduled', 'proposal_sent', 'negotiation'];
  const pipelineValue = activeStages.reduce((sum, stage) => {
    const stageDeals = deals[stage] || [];
    return sum + stageDeals.reduce((s, d) => s + (d.value || 0), 0);
  }, 0);

  const wonDeals = deals['won'] || [];
  const wonRevenue = wonDeals.reduce((sum, d) => sum + (d.revenue || d.value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM Pipeline</h1>
          <p className="text-gray-500 mt-1">Track deals from lead to close — {deals['won']?.length || 0} deals won</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
          <Plus size={16} /> Add Deal
        </button>
      </div>

      {/* Revenue Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <DollarSign size={14} className="text-emerald-500" />
            Won Revenue
          </div>
          <p className="text-2xl font-bold text-gray-900">${wonRevenue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{wonDeals.length} deals closed</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Target size={14} className="text-amber-500" />
            Pipeline Value
          </div>
          <p className="text-2xl font-bold text-gray-900">${pipelineValue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <BarChart3 size={14} className="text-blue-500" />
            Win Rate
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {funnel ? `${funnel.opportunityToWon}%` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <TrendingUp size={14} className="text-primary" />
            AI Revenue %
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {revenueStats ? `${revenueStats.aiRevenuePercentage}%` : '—'}
          </p>
        </div>
      </div>

      {/* Pipeline Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageDeals = deals[stage.key] || [];
          return (
            <div key={stage.key} className="min-w-[200px]">
              <div className={`px-3 py-2 rounded-lg text-sm font-medium mb-2 flex items-center justify-between ${stage.color}`}>
                <span>{stage.label}</span>
                <span className="opacity-70">{stageDeals.length}</span>
              </div>
              <div className="space-y-2">
                {stageDeals.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200 p-4 text-center">
                    <p className="text-xs text-gray-400">No deals</p>
                  </div>
                ) : (
                  stageDeals.map((deal: any) => (
                    <div
                      key={deal.id}
                      onClick={() => loadTimeline(deal)}
                      className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-primary/30"
                    >
                      <p className="font-medium text-sm text-gray-900 truncate">{deal.title}</p>
                      {(deal.value || deal.revenue) && (
                        <p className="text-sm font-semibold text-gray-700 mt-1">
                          ${(deal.revenue || deal.value).toLocaleString()}
                        </p>
                      )}
                      {deal.lead && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                          <Users size={10} />
                          <span className="truncate">{deal.lead.name || deal.lead.socialHandle}</span>
                        </div>
                      )}
                      {deal.source && (
                        <span className="text-[10px] text-gray-400 mt-1 block">
                          Source: {deal.source}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deal Timeline Modal */}
      {selectedDeal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDeal(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedDeal.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedDeal.lead?.name || selectedDeal.lead?.socialHandle} · {STAGE_LABEL[selectedDeal.stage] || selectedDeal.stage}
                  </p>
                </div>
                <button onClick={() => setSelectedDeal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              {selectedDeal.value && (
                <div className="mt-3 p-3 bg-primary-50 rounded-lg">
                  <span className="text-sm text-primary font-medium">Deal Value: ${(selectedDeal.revenue || selectedDeal.value).toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="p-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Customer Journey Timeline</h4>
              {timelineLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No timeline events found</p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((event: any, i: number) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                          event.type === 'deal_won' ? 'bg-emerald-500' :
                          event.type === 'lead_created' ? 'bg-blue-500' :
                          event.type === 'deal_created' ? 'bg-purple-500' :
                          'bg-gray-300'
                        }`} />
                        {i < timeline.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                      </div>
                      <div className="pb-4 flex-1">
                        <p className="text-sm font-medium text-gray-900">{event.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(event.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
