'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, Mail, Settings, Calendar, Download, TrendingUp, Users, MessageSquare, Shield, Loader2, CheckCircle, BarChart3 } from 'lucide-react';

type ReportConfig = {
  enabled: boolean;
  frequency: 'weekly' | 'monthly';
  email: string | null;
  includeRevenue: boolean;
  includeLeads: boolean;
  includeConversations: boolean;
  includeReputation: boolean;
  includeRecommendations: boolean;
  dayOfMonth: number;
  businessName: string;
};

type ReportMetrics = {
  leads: { captured: number; converted: number; conversionRate: number };
  conversations: { total: number; responseRate: number };
  revenue: { total: number; aiPercentage: number; dealsWon: number };
  reputation: { score: number };
  summary: string;
};

type GeneratedReport = {
  metrics: ReportMetrics;
  html: string;
  generatedAt: string;
};

export default function ReportsPage() {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [generated, setGenerated] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    enabled: false,
    frequency: 'monthly' as 'weekly' | 'monthly',
    email: '',
    includeRevenue: true,
    includeLeads: true,
    includeConversations: true,
    includeReputation: true,
    includeRecommendations: true,
    dayOfMonth: 1,
  });

  useEffect(() => {
    api.get<any>('/api/reports/config').then((res) => {
      if (res.success && res.data) {
        setConfig(res.data);
        setForm({
          enabled: res.data.enabled,
          frequency: res.data.frequency || 'monthly',
          email: res.data.email || '',
          includeRevenue: res.data.includeRevenue ?? true,
          includeLeads: res.data.includeLeads ?? true,
          includeConversations: res.data.includeConversations ?? true,
          includeReputation: res.data.includeReputation ?? true,
          includeRecommendations: res.data.includeRecommendations ?? true,
          dayOfMonth: res.data.dayOfMonth || 1,
        });
      }
      setLoading(false);
    }).catch(() => {
      setError('Failed to load report configuration');
      setLoading(false);
    });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const res = await api.post<any>('/api/reports/generate');
    if (res.success && res.data) {
      setGenerated(res.data);
    } else {
      setError(res.error || 'Failed to generate report');
    }
    setGenerating(false);
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    const res = await api.put('/api/reports/config', form);
    if (res.success) {
      setConfig({ ...config, ...form } as ReportConfig);
    }
    setLoading(false);
  };

  if (loading && !config) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
            <BarChart3 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monthly Reports</h1>
            <p className="text-sm text-gray-500">Generate and schedule performance reports</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Leads Report</p>
              <p className="text-xs text-gray-500">Captured, converted, sources</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${form.includeLeads ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{form.includeLeads ? 'Included' : 'Excluded'}</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp size={20} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Revenue Report</p>
              <p className="text-xs text-gray-500">Deals, AI attribution</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${form.includeRevenue ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{form.includeRevenue ? 'Included' : 'Excluded'}</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Shield size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Reputation Report</p>
              <p className="text-xs text-gray-500">Score, sentiment, trends</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${form.includeReputation ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{form.includeReputation ? 'Included' : 'Excluded'}</span>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Report Configuration</h2>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Auto-generate</span>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
          </label>
        </div>
        <div className="p-4 space-y-4">
          {form.enabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Recipient</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@yourbusiness.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value as 'weekly' | 'monthly' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                {form.frequency === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={form.dayOfMonth}
                      onChange={(e) => setForm({ ...form, dayOfMonth: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Include in Report</label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: 'includeLeads', label: 'Leads' },
                    { key: 'includeRevenue', label: 'Revenue' },
                    { key: 'includeConversations', label: 'Conversations' },
                    { key: 'includeReputation', label: 'Reputation' },
                    { key: 'includeRecommendations', label: 'Recommendations' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={(form as any)[item.key]}
                        onChange={(e) => setForm({ ...form, [item.key]: e.target.checked })}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          {!form.enabled && (
            <p className="text-sm text-gray-400 italic">
              Enable auto-generation to configure email delivery and scheduling.
            </p>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleSaveConfig}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>

      {/* Generated Report Preview */}
      {generated && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" />
              <h2 className="font-semibold text-gray-900">Report Generated</h2>
            </div>
            <span className="text-xs text-gray-500">
              {new Date(generated.generatedAt).toLocaleString()}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{generated.metrics.leads.captured}</p>
              <p className="text-xs text-gray-500">Leads Captured</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{generated.metrics.leads.conversionRate}%</p>
              <p className="text-xs text-gray-500">Conversion Rate</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">
                ₹{(generated.metrics.revenue.total / 100).toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-gray-500">Revenue</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{generated.metrics.revenue.aiPercentage}%</p>
              <p className="text-xs text-gray-500">AI Attribution</p>
            </div>
          </div>
          <div className="p-4 border-t border-gray-100">
            <p className="text-sm text-gray-600">{generated.metrics.summary}</p>
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <details>
              <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                View HTML Preview
              </summary>
              <div className="mt-3 max-h-96 overflow-auto border border-gray-200 rounded-lg">
                <iframe
                  srcDoc={generated.html}
                  className="w-full h-96 bg-white"
                  title="Report Preview"
                />
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!generated && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <FileText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No reports generated yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Click "Generate Report" to create your first monthly performance report.
          </p>
        </div>
      )}
    </div>
  );
}
