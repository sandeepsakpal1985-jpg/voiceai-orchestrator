'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Zap, Plus, Trash2, ToggleLeft, ToggleRight,
  MessageSquare, MessageCircle, ThumbsUp, Tag, AlertTriangle,
  Save, Loader2,
} from 'lucide-react';

type TriggerRule = {
  id: string;
  keyword: string;
  matchType: 'exact' | 'contains' | 'starts_with';
  action: 'auto_reply_comment' | 'auto_reply_dm' | 'send_dm' | 'like_comment' | 'tag_lead' | 'escalate';
  replyTemplate?: string;
  enabled: boolean;
  priority: number;
  platform: 'instagram' | 'facebook' | 'all';
};

const ACTION_LABELS: Record<string, string> = {
  auto_reply_comment: 'Auto-Reply to Comment',
  auto_reply_dm: 'Auto-Reply via DM',
  send_dm: 'Send DM to User',
  like_comment: 'Like Comment',
  tag_lead: 'Tag Lead',
  escalate: 'Escalate',
};

const ACTION_ICONS: Record<string, any> = {
  auto_reply_comment: MessageSquare,
  auto_reply_dm: MessageCircle,
  send_dm: MessageCircle,
  like_comment: ThumbsUp,
  tag_lead: Tag,
  escalate: AlertTriangle,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200/30',
  facebook: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/30',
  all: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/30',
};

function generateId() {
  return `trigger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY_TRIGGER: TriggerRule = {
  id: generateId(),
  keyword: '',
  matchType: 'contains',
  action: 'auto_reply_comment',
  replyTemplate: '',
  enabled: true,
  priority: 0,
  platform: 'all',
};

export default function AutomationPage() {
  const [triggers, setTriggers] = useState<TriggerRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copilotResult, setCopilotResult] = useState<string | null>(null);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotStyle, setCopilotStyle] = useState('friendly');
  const [copilotLoading, setCopilotLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetch('/api/automation/triggers', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()).then((data: any) => {
      if (data?.success && Array.isArray(data.data)) {
        setTriggers(data.data);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/api/automation/triggers', { triggers });
      if (res.success) {
        toast.success(`${triggers.length} trigger rules saved`);
      } else {
        toast.error(res.error || 'Failed to save triggers');
      }
    } catch {
      toast.error('Network error saving triggers');
    } finally {
      setSaving(false);
    }
  };

  const addTrigger = () => {
    setTriggers([...triggers, { ...EMPTY_TRIGGER, id: generateId() }]);
  };

  const removeTrigger = (id: string) => {
    setTriggers(triggers.filter(t => t.id !== id));
  };

  const updateTrigger = (id: string, field: string, value: any) => {
    setTriggers(triggers.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleCopilot = async () => {
    if (!copilotInput.trim()) return;
    setCopilotLoading(true);
    try {
      const copilotRes: any = await api.post('/api/automation/copilot', {
        content: copilotInput,
        context: { platform: 'instagram' },
        style: copilotStyle,
        count: 3,
      });
      if (copilotRes.success) {
        setCopilotResult(copilotRes.data.suggestions.map((s: any) => s.raw).join('\n\n'));
      } else {
        toast.error(copilotRes.error || 'Failed to generate suggestions');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setCopilotLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Automation</h1>
              <p className="text-sm text-gray-500">Keyword triggers, comment-to-DM, and AI copilot</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addTrigger}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus size={16} /> Add Trigger
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      {/* Keyword Triggers */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Keyword Triggers ({triggers.length})</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            When a comment or DM matches these keywords, the specified action is triggered automatically.
          </p>
        </div>

        {triggers.length === 0 ? (
          <div className="p-12 text-center">
            <Zap size={40} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-medium text-gray-900 mb-1">No Trigger Rules Yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add keyword triggers to automate responses to common customer messages.
            </p>
            <button
              onClick={addTrigger}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} className="inline mr-1" /> Add Your First Trigger
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {triggers.map((trigger, idx) => {
              const ActionIcon = ACTION_ICONS[trigger.action] || Zap;
              return (
                <div key={trigger.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Row 1: Keyword + Match type */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-400 w-6">{idx + 1}</span>
                        <input
                          type="text"
                          value={trigger.keyword}
                          onChange={(e) => updateTrigger(trigger.id, 'keyword', e.target.value)}
                          placeholder="Enter keyword..."
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        />
                        <select
                          value={trigger.matchType}
                          onChange={(e) => updateTrigger(trigger.id, 'matchType', e.target.value)}
                          className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        >
                          <option value="contains">Contains</option>
                          <option value="exact">Exact Match</option>
                          <option value="starts_with">Starts With</option>
                        </select>
                      </div>

                      {/* Row 2: Action + Platform */}
                      <div className="flex items-center gap-3 ml-9">
                        <div className="flex items-center gap-1.5">
                          <ActionIcon size={14} className="text-gray-400" />
                          <select
                            value={trigger.action}
                            onChange={(e) => updateTrigger(trigger.id, 'action', e.target.value)}
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          >
                            {Object.entries(ACTION_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <select
                          value={trigger.platform}
                          onChange={(e) => updateTrigger(trigger.id, 'platform', e.target.value)}
                          className={`text-xs px-2 py-1 rounded font-medium ${PLATFORM_COLORS[trigger.platform] || ''}`}
                        >
                          <option value="all">All Platforms</option>
                          <option value="instagram">Instagram</option>
                          <option value="facebook">Facebook</option>
                        </select>
                      </div>

                      {/* Reply template (for auto-reply actions) */}
                      {(trigger.action === 'auto_reply_comment' || trigger.action === 'auto_reply_dm' || trigger.action === 'send_dm') && (
                        <div className="ml-9">
                          <textarea
                            value={trigger.replyTemplate || ''}
                            onChange={(e) => updateTrigger(trigger.id, 'replyTemplate', e.target.value)}
                            placeholder="Reply template... Use {{name}} for customer name, {{business}} for business name"
                            rows={2}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => updateTrigger(trigger.id, 'enabled', !trigger.enabled)}
                        className={`p-1 rounded transition-colors ${trigger.enabled ? 'text-emerald-500 hover:text-emerald-700' : 'text-gray-300 hover:text-gray-500'}`}
                        title={trigger.enabled ? 'Enabled' : 'Disabled'}
                      >
                        {trigger.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        onClick={() => removeTrigger(trigger.id)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        title="Delete trigger"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Copilot */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-gradient-to-br from-violet-400 to-violet-600 rounded-lg">
            <Zap size={16} className="text-white" />
          </div>
          <h2 className="font-semibold text-gray-900">AI Copilot</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Generate contextual reply suggestions for any customer message. Try different styles and angles.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer Message</label>
            <textarea
              value={copilotInput}
              onChange={(e) => setCopilotInput(e.target.value)}
              placeholder="Paste a customer comment or DM to generate reply suggestions..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Style</label>
              <select
                value={copilotStyle}
                onChange={(e) => setCopilotStyle(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              >
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="short">Short & Direct</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
            <button
              onClick={handleCopilot}
              disabled={copilotLoading || !copilotInput.trim()}
              className="self-end px-4 py-1.5 bg-gradient-to-br from-violet-500 to-violet-700 text-white rounded-lg text-sm font-medium hover:from-violet-600 hover:to-violet-800 transition-all disabled:opacity-50"
            >
              {copilotLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : 'Generate Suggestions'}
            </button>
          </div>

          {copilotResult && (
            <div className="bg-violet-50 border border-violet-100 rounded-lg p-4">
              <p className="text-xs font-medium text-violet-700 mb-2">AI Suggestions</p>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {copilotResult}
              </div>
              <button
                onClick={() => setCopilotResult(null)}
                className="mt-2 text-xs text-violet-500 hover:underline"
              >
                Clear suggestions
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
