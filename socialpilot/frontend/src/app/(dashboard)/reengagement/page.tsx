'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  RefreshCw, Play, Save, TestTube, Zap, Users,
  ToggleLeft, ToggleRight, Clock, Target,
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  Bot, MessageSquare,
} from 'lucide-react';

// ── Types ──

interface N8nStatus {
  configured: boolean;
  baseUrl: string | null;
  hasApiKey: boolean;
}

interface ReEngagementRule {
  id: string;
  userId: string;
  enabled: boolean;
  stages: ReEngagementStage[];
  onlyDormant: boolean;
  excludeCustomers: boolean;
  minLeadScore: number | null;
}

interface ReEngagementStage {
  delay: string;
  messageTemplate: string;
}

interface DormantLead {
  id: string;
  name: string | null;
  socialHandle: string;
  platform: string;
  leadScore: number;
  category: string;
  lastContactAt: string;
  conversationSummary: string | null;
}

// ── Skeleton ──

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-white border border-gray-100 p-5 ${className}`}>
      <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-gray-100 rounded" />
        <div className="h-4 w-3/4 bg-gray-100 rounded" />
        <div className="h-4 w-1/2 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

// ── Stage Card ──

const STAGE_LABELS: Record<string, string> = {
  '24h': '24 Hours',
  '3d': '3 Days',
  '7d': '7 Days (Final)',
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  '24h': 'First follow-up — gentle reminder',
  '3d': 'Middle follow-up — check in',
  '7d': 'Last check-in — final opportunity',
};

function StageCard({
  stage,
  index,
  onChange,
  onRemove,
  isLast,
}: {
  stage: ReEngagementStage;
  index: number;
  onChange: (index: number, field: string, value: string) => void;
  onRemove: (index: number) => void;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <span className="font-medium text-sm text-gray-900">
            {STAGE_LABELS[stage.delay] || stage.delay}
          </span>
          <span className="text-xs text-gray-500">{STAGE_DESCRIPTIONS[stage.delay]}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLast ? null : (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
            >
              Remove
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Delay</label>
            <select
              value={stage.delay}
              onChange={(e) => onChange(index, 'delay', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="24h">24 Hours</option>
              <option value="3d">3 Days</option>
              <option value="7d">7 Days (Final)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Message Template
            </label>
            <textarea
              value={stage.messageTemplate}
              onChange={(e) => onChange(index, 'messageTemplate', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              placeholder="Hi {{name}}, we noticed you were interested in {{product}}..."
            />
            <p className="text-xs text-gray-400 mt-1">
              Use {'{{name}}'}, {'{{product}}'} as placeholders
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export default function ReEngagementPage() {
  // n8n status
  const [n8nStatus, setN8nStatus] = useState<N8nStatus | null>(null);

  // Rules
  const [rules, setRules] = useState<ReEngagementRule | null>(null);
  const [loadingRules, setLoadingRules] = useState(true);

  // Dormant leads
  const [candidates, setCandidates] = useState<DormantLead[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);

  // Saving
  const [saving, setSaving] = useState(false);

  // Test webhook
  const [testWebhookId, setTestWebhookId] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Trigger
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    // Load n8n status
    api.get<N8nStatus>('/api/n8n/status').then((res) => {
      if (res.success) setN8nStatus(res.data ?? null);
    }).catch(() => {});

    // Load re-engagement rules
    try {
      const rulesRes = await api.get<ReEngagementRule>('/api/reengagement/rules');
      if (rulesRes.success && rulesRes.data) setRules(rulesRes.data);
    } catch {
      toast.error('Failed to load re-engagement rules');
    } finally {
      setLoadingRules(false);
    }

    // Load dormant leads
    try {
      const candidatesRes = await api.get<DormantLead[]>('/api/reengagement/candidates');
      if (candidatesRes.success && candidatesRes.data) setCandidates(candidatesRes.data);
    } catch {
      // Candidates are optional — silently fail
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Rules Editor ──

  const handleStageChange = (index: number, field: string, value: string) => {
    if (!rules) return;
    const newStages = [...rules.stages];
    (newStages[index] as any)[field] = value;
    setRules({ ...rules, stages: newStages });
  };

  const handleRemoveStage = (index: number) => {
    if (!rules) return;
    const newStages = rules.stages.filter((_, i) => i !== index);
    setRules({ ...rules, stages: newStages });
  };

  const handleAddStage = () => {
    if (!rules) return;
    setRules({
      ...rules,
      stages: [...rules.stages, { delay: '24h', messageTemplate: '' }],
    });
  };

  const handleSaveRules = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      const res = await api.put('/api/reengagement/rules', {
        enabled: rules.enabled,
        stages: rules.stages,
        conditions: {
          minLeadScore: rules.minLeadScore ?? undefined,
          onlyDormant: rules.onlyDormant,
          excludeCustomers: rules.excludeCustomers,
        },
      });
      if (res.success) {
        toast.success('Re-engagement rules saved');
      } else {
        toast.error(res.error || 'Failed to save rules');
      }
    } catch {
      toast.error('Network error saving rules');
    } finally {
      setSaving(false);
    }
  };

  // ── Test Webhook ──

  const handleTestWebhook = async () => {
    if (!testWebhookId.trim()) {
      toast.error('Enter a webhook ID');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/api/n8n/test', {
        webhookId: testWebhookId.trim(),
        payload: {
          event: 'test',
          timestamp: new Date().toISOString(),
          message: 'This is a test from MetaPilot AI',
        },
      });
      if (res.success) {
        setTestResult({ success: true, data: res.data });
        toast.success('Webhook test succeeded');
      } else {
        setTestResult({ success: false, error: res.error });
        toast.error(res.error || 'Webhook test failed');
      }
    } catch {
      toast.error('Network error testing webhook');
    } finally {
      setTesting(false);
    }
  };

  // ── Manual Trigger ──

  const handleTriggerReengagement = async (lead: DormantLead) => {
    setTriggeringId(lead.id);
    try {
      const res = await api.post('/api/n8n/trigger/reengagement', {
        customerId: lead.id,
        stage: '24h',
        customerName: lead.name || lead.socialHandle,
        leadScore: lead.leadScore,
      });
      if (res.success) {
        toast.success(`Re-engagement triggered for ${lead.name || lead.socialHandle}`);
      } else {
        toast.error(res.error || 'Failed to trigger re-engagement');
      }
    } catch {
      toast.error('Network error triggering re-engagement');
    } finally {
      setTriggeringId(null);
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Re-engagement Automation</h1>
          <p className="text-gray-500 mt-1">Automatically follow up with dormant leads to maximize conversions</p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* n8n Status Bar */}
      {n8nStatus && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          n8nStatus.configured
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {n8nStatus.configured ? (
            <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={20} className="text-amber-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${n8nStatus.configured ? 'text-emerald-900' : 'text-amber-900'}`}>
              {n8nStatus.configured ? 'n8n Connected' : 'n8n Not Configured'}
            </p>
            <p className={`text-xs mt-0.5 ${n8nStatus.configured ? 'text-emerald-700' : 'text-amber-700'}`}>
              {n8nStatus.configured
                ? `Connected to ${n8nStatus.baseUrl}${n8nStatus.hasApiKey ? ' · API key set' : ''}`
                : 'Set N8N_BASE_URL and N8N_API_KEY in your .env to enable workflow automation.'}
            </p>
          </div>
          {n8nStatus.configured && (
            <Bot size={24} className="text-emerald-400 shrink-0" />
          )}
        </div>
      )}

      {loadingRules ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Rules Editor */}
          <div className="space-y-6">
            {/* Enable/Disable toggle */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-primary" />
                  <h2 className="font-semibold text-gray-900">Automation Status</h2>
                </div>
                <button
                  onClick={() => rules && setRules({ ...rules, enabled: !rules.enabled })}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    rules?.enabled
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {rules?.enabled ? (
                    <><ToggleRight size={16} /> Enabled</>
                  ) : (
                    <><ToggleLeft size={16} /> Disabled</>
                  )}
                </button>
              </div>
              <p className="text-sm text-gray-500">
                {rules?.enabled
                  ? 'AI will automatically follow up with dormant leads based on your stage templates.'
                  : 'No automatic follow-ups will be sent. Dormant leads will remain untouched.'}
              </p>
            </div>

            {/* Stage Templates */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-primary" />
                  <h2 className="font-semibold text-gray-900">Stage Templates</h2>
                </div>
                <button
                  onClick={handleAddStage}
                  disabled={rules ? rules.stages.length >= 3 : false}
                  className="text-xs px-3 py-1.5 bg-primary-50 text-primary rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-40"
                >
                  + Add Stage
                </button>
              </div>

              {rules && rules.stages.length === 0 ? (
                <div className="text-center py-8">
                  <Clock size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">No stages configured yet</p>
                  <button
                    onClick={handleAddStage}
                    className="mt-2 text-sm text-primary hover:underline"
                  >
                    Add your first stage
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules?.stages.map((stage, i) => (
                    <StageCard
                      key={i}
                      stage={stage}
                      index={i}
                      onChange={handleStageChange}
                      onRemove={handleRemoveStage}
                      isLast={rules ? i === rules.stages.length - 1 : false}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Conditions + Save */}
          <div className="space-y-6">
            {/* Conditions */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target size={18} className="text-primary" />
                <h2 className="font-semibold text-gray-900">Conditions</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Only dormant leads</p>
                    <p className="text-xs text-gray-500">Skip leads contacted within 24 hours</p>
                  </div>
                  <button
                    onClick={() => rules && setRules({ ...rules, onlyDormant: !rules.onlyDormant })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      rules?.onlyDormant
                        ? 'bg-primary-50 text-primary'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {rules?.onlyDormant ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Exclude existing customers</p>
                    <p className="text-xs text-gray-500">Don't re-engage leads who already converted</p>
                  </div>
                  <button
                    onClick={() => rules && setRules({ ...rules, excludeCustomers: !rules.excludeCustomers })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      rules?.excludeCustomers
                        ? 'bg-primary-50 text-primary'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {rules?.excludeCustomers ? 'On' : 'Off'}
                  </button>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Minimum lead score
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rules?.minLeadScore ?? ''}
                    onChange={(e) => rules && setRules({ ...rules, minLeadScore: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="0 (no minimum)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Only re-engage leads with score equal or higher
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveRules}
              disabled={saving || !rules}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-700 transition-all disabled:opacity-50 shadow-sm shadow-primary-200/50"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {saving ? 'Saving...' : 'Save Re-engagement Rules'}
            </button>

            {/* Test Webhook */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TestTube size={18} className="text-primary" />
                <h2 className="font-semibold text-gray-900">Test n8n Webhook</h2>
              </div>
              <div className="flex gap-2">
                <input
                  value={testWebhookId}
                  onChange={(e) => setTestWebhookId(e.target.value)}
                  placeholder="Webhook ID (e.g., socialpilot-reengagement)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  disabled={!n8nStatus?.configured}
                />
                <button
                  onClick={handleTestWebhook}
                  disabled={testing || !n8nStatus?.configured}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
                >
                  {testing ? (
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Test
                </button>
              </div>

              {testResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <p className="font-medium mb-1">
                    {testResult.success ? 'Webhook responded successfully' : `Error: ${testResult.error}`}
                  </p>
                  {testResult.data && (
                    <pre className="text-xs mt-1 opacity-75 overflow-auto max-h-24">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dormant Leads */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-900">Dormant Leads</h2>
          </div>
          {candidates.length > 0 && (
            <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              {candidates.length} candidates
            </span>
          )}
        </div>

        {loadingCandidates ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-4 p-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
                <div className="h-8 w-24 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare size={40} className="mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-medium text-gray-900">No dormant leads</h3>
            <p className="text-gray-500 mt-1 text-sm">
              All your leads have been contacted recently. New dormant leads will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {candidates.map((lead) => (
              <div key={lead.id} className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors group">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-sm font-medium text-gray-600">
                    {(lead.name || lead.socialHandle).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {lead.name || lead.socialHandle}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      lead.category === 'hot' ? 'bg-red-50 text-red-700' :
                      lead.category === 'warm' ? 'bg-amber-50 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {lead.category}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      Score: {lead.leadScore}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{lead.platform}</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">
                      Last contact: {new Date(lead.lastContactAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleTriggerReengagement(lead)}
                  disabled={triggeringId === lead.id || !n8nStatus?.configured}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-40 opacity-0 group-hover:opacity-100"
                  title={!n8nStatus?.configured ? 'Configure n8n first' : 'Trigger re-engagement'}
                >
                  {triggeringId === lead.id ? (
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                  Re-engage
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
