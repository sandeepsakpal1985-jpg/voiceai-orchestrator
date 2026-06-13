'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Lightbulb, TrendingUp, TrendingDown, Minus,
  MessageSquare, DollarSign, AlertCircle, BarChart3,
  RefreshCw, Users, Target, Trophy,
} from 'lucide-react';

interface Insight {
  id: string;
  category: string;
  title: string;
  description: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  period: string;
  generatedAt: string;
}

interface InsightReport {
  summary: string;
  recommendations: string[];
  insights: Insight[];
}

interface ExecutiveSummary {
  summary: string;
  period: string;
  metrics: {
    leadsGenerated: number;
    hotLeads: number;
    opportunitiesCreated: number;
    dealsWon: number;
    totalRevenue: number;
    aiAttributedRevenue: number;
    aiRevenuePercentage: number;
    interactions: number;
  };
}

const CATEGORY_ICONS: Record<string, any> = {
  common_questions: MessageSquare,
  common_objections: AlertCircle,
  requested_products: DollarSign,
  best_cta: BarChart3,
  sentiment_trend: TrendingUp,
  response_quality: Lightbulb,
};

const CATEGORY_LABELS: Record<string, string> = {
  common_questions: 'Common Questions',
  common_objections: 'Common Objections',
  requested_products: 'Requested Products',
  best_cta: 'Best Performing CTA',
  sentiment_trend: 'Sentiment Trends',
  response_quality: 'Response Quality',
};

export default function InsightsPage() {
  const [report, setReport] = useState<InsightReport | null>(null);
  const [execSummary, setExecSummary] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState('monthly');

  const loadData = async (p: string) => {
    setLoading(true);
    const [insightsRes, execRes] = await Promise.all([
      api.get<InsightReport>(`/api/analytics/insights?period=${p}`),
      api.get<ExecutiveSummary>(`/api/revenue/executive-summary?period=${p}`),
    ]);
    if (insightsRes.success && insightsRes.data) setReport(insightsRes.data);
    if (execRes.success && execRes.data) setExecSummary(execRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData(period);
  }, [period]);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await api.post<InsightReport>('/api/analytics/insights/generate', { period });
    if (res.success && res.data) setReport(res.data);
    setGenerating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
          <p className="text-gray-500 mt-1">Revenue attribution & intelligence from customer interactions</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
            Generate Insights
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !report && !execSummary ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Lightbulb size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No insights yet</h3>
          <p className="text-gray-500 mt-1">Generate insights to see intelligence from your conversations</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-4 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            Generate Now
          </button>
        </div>
      ) : (
        <>
          {/* Revenue Executive Summary */}
          {execSummary && execSummary.metrics.leadsGenerated > 0 && (
            <div className="bg-gradient-to-br from-primary to-purple-700 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={20} />
                <span className="font-semibold">Revenue Executive Summary</span>
              </div>
              <p className="text-white/90 leading-relaxed text-lg">{execSummary.summary}</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-white/20">
                <div className="text-center">
                  <Users size={20} className="mx-auto mb-1 text-white/70" />
                  <p className="text-2xl font-bold">{execSummary.metrics.leadsGenerated}</p>
                  <p className="text-xs text-white/70">Leads Generated</p>
                </div>
                <div className="text-center">
                  <Target size={20} className="mx-auto mb-1 text-white/70" />
                  <p className="text-2xl font-bold">{execSummary.metrics.opportunitiesCreated}</p>
                  <p className="text-xs text-white/70">Opportunities</p>
                </div>
                <div className="text-center">
                  <Trophy size={20} className="mx-auto mb-1 text-white/70" />
                  <p className="text-2xl font-bold">{execSummary.metrics.dealsWon}</p>
                  <p className="text-xs text-white/70">Deals Won</p>
                </div>
                <div className="text-center">
                  <DollarSign size={20} className="mx-auto mb-1 text-white/70" />
                  <p className="text-2xl font-bold">${execSummary.metrics.totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-white/70">Revenue</p>
                </div>
              </div>

              {execSummary.metrics.aiRevenuePercentage > 0 && (
                <div className="mt-4 pt-3 border-t border-white/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">AI-Attributed Revenue</span>
                    <span className="text-lg font-bold">
                      ${execSummary.metrics.aiAttributedRevenue.toLocaleString()}
                      <span className="text-sm font-normal text-white/70 ml-1">
                        ({execSummary.metrics.aiRevenuePercentage}% of total)
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 bg-white/20 rounded-full h-2">
                    <div
                      className="bg-white rounded-full h-2 transition-all"
                      style={{ width: `${execSummary.metrics.aiRevenuePercentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI-Generated Insights */}
          {report && (
            <>
              {report.recommendations.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">AI Recommendations</h3>
                  <ul className="space-y-2">
                    {report.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-1.5 w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Insights grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.insights.map((insight) => {
                  const Icon = CATEGORY_ICONS[insight.category] || Lightbulb;
                  return (
                    <div key={insight.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-primary-50 rounded-lg">
                            <Icon size={16} className="text-primary" />
                          </div>
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {CATEGORY_LABELS[insight.category] || insight.category}
                          </span>
                        </div>
                        <span className={`
                          flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full
                          ${insight.trend === 'up' ? 'bg-green-50 text-green-700' : ''}
                          ${insight.trend === 'down' ? 'bg-red-50 text-red-700' : ''}
                          ${insight.trend === 'stable' ? 'bg-gray-50 text-gray-700' : ''}
                        `}>
                          {insight.trend === 'up' && <TrendingUp size={12} />}
                          {insight.trend === 'down' && <TrendingDown size={12} />}
                          {insight.trend === 'stable' && <Minus size={12} />}
                          {insight.trend}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{insight.title}</h3>
                      <p className="text-sm text-gray-500">{insight.description}</p>
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <span className="text-2xl font-bold text-gray-900">{insight.value}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
