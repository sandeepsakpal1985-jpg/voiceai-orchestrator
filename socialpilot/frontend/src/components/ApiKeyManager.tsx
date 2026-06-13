'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Key, Plus, Copy, Trash2, Loader2, CheckCircle } from 'lucide-react';

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const loadKeys = () => {
    api.get<any[]>('/api/api-keys').then((res) => {
      if (res.success) setKeys(res.data || []);
      setLoading(false);
    });
  };

  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async () => {
    if (!newKeyName) return;
    setError('');
    const res = await api.post<any>('/api/api-keys', { name: newKeyName });
    if (res.success) {
      setCreatedKey(res.data?.rawKey);
      setNewKeyName('');
      setShowCreate(false);
      loadKeys();
    } else {
      setError(res.error || 'Failed to create key');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await api.delete(`/api/api-keys/${id}`);
    setKeys(keys.filter(k => k.id !== id));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-primary" />
          <h2 className="font-semibold text-gray-900">API Keys</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={14} /> Create Key
        </button>
      </div>

      {/* Created key reveal */}
      {createdKey && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-medium text-amber-800 mb-1">⚠️ Copy this key now — it won't be shown again!</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-2 py-1.5 rounded border border-amber-200 font-mono break-all">
              {createdKey}
            </code>
            <button
              onClick={() => copyToClipboard(createdKey)}
              className="p-1.5 hover:bg-amber-100 rounded transition-colors"
              title="Copy"
            >
              {copied ? <CheckCircle size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-amber-600 hover:underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Production API"
            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} disabled={!newKeyName}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50">
            Create
          </button>
          <button onClick={() => setShowCreate(false)}
            className="px-3 py-1.5 text-gray-500 text-xs hover:bg-gray-200 rounded-lg">
            Cancel
          </button>
        </div>
      )}

      {/* Key list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
        ) : keys.length === 0 ? (
          <div className="text-center py-6">
            <Key size={24} className="mx-auto text-gray-300 mb-1" />
            <p className="text-xs text-gray-500">No API keys created yet</p>
          </div>
        ) : (
          keys.filter(k => k.active).map((key) => (
            <div key={key.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <Key size={14} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{key.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{key.prefix}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-gray-400">
                  {key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                </span>
                <button onClick={() => handleRevoke(key.id)}
                  className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                  title="Revoke">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
