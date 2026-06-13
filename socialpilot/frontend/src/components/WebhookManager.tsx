'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Webhook, Plus, Trash2, Loader2, ExternalLink, ToggleLeft, ToggleRight } from 'lucide-react';

const EVENT_OPTIONS = [
  { value: 'comment.created', label: 'Comment Created' },
  { value: 'comment.replied', label: 'Comment Replied' },
  { value: 'dm.received', label: 'DM Received' },
  { value: 'lead.created', label: 'Lead Created' },
  { value: 'deal.won', label: 'Deal Won' },
  { value: 'escalation.created', label: 'Escalation Created' },
  { value: 'missed_opportunity', label: 'Missed Opportunity' },
];

export default function WebhookManager() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', events: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadConfigs = () => {
    api.get('/api/webhooks').then((res: any) => {
      if (res.success) setConfigs(res.data || []);
      setLoading(false);
    });
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.url || form.events.length === 0) return;
    setSaving(true);
    setError('');
    const res = await api.post('/api/webhooks', form);
    if (res.success) {
      setForm({ name: '', url: '', events: [] });
      setShowCreate(false);
      loadConfigs();
    } else {
      setError(res.error || 'Failed to create webhook');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook? This cannot be undone.')) return;
    await api.delete(`/api/webhooks/${id}`);
    setConfigs(configs.filter(c => c.id !== id));
  };

  const toggleActive = async (id: string, current: boolean) => {
    const res = await api.put(`/api/webhooks/${id}`, { active: !current });
    if (res.success) loadConfigs();
  };

  const toggleEvent = (event: string) => {
    setForm(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Webhook size={18} className="text-primary" />
          <h2 className="font-semibold text-gray-900">Webhooks</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={14} /> Add Webhook
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Webhook name"
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://your-server.com/webhook"
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">Events to subscribe to:</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleEvent(opt.value)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    form.events.includes(opt.value)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.name || !form.url || form.events.length === 0}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-200 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
        ) : configs.length === 0 ? (
          <div className="text-center py-6">
            <Webhook size={24} className="mx-auto text-gray-300 mb-1" />
            <p className="text-xs text-gray-500">No webhooks configured yet</p>
          </div>
        ) : (
          configs.map((config) => (
            <div key={config.id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Webhook size={14} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{config.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(config.id, config.active)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors" title="Toggle active">
                    {config.active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-gray-400" />}
                  </button>
                  <button onClick={() => handleDelete(config.id)}
                    className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                <ExternalLink size={10} />
                <span className="truncate">{config.url}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {config.events?.map((ev: string) => (
                  <span key={ev} className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-500">
                    {ev}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
