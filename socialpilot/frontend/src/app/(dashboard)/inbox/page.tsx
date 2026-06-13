'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useWebSocket } from '@/lib/use-websocket';
import {
  Search, MessageSquare, AlertCircle, CheckCircle2, Clock,
  Inbox, X, Send, CheckSquare, Square,
  RefreshCw, UserCheck, Bot, Download, Zap,
} from 'lucide-react';

// ── Types ──

interface InboxItem {
  id: string;
  platform: string;
  type: string;
  customerHandle: string;
  customerName?: string;
  content: string;
  status: string;
  priority: string;
  assignedTo?: string;
  aiSuggestedReply?: string;
  internalNote?: string;
  createdAt: string;
}

// ── Skeleton ──

function SkeletonRow() {
  return (
    <div className="p-4 animate-pulse flex items-start gap-3">
      <div className="w-4 h-4 bg-gray-200 rounded mt-1 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-gray-200 rounded" />
          <div className="h-5 w-14 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="h-3 w-16 bg-gray-200 rounded shrink-0" />
    </div>
  );
}

// ── Status Helpers ──

const STATUS_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  unread: { icon: AlertCircle, label: 'Unread', color: 'text-red-500' },
  read: { icon: Clock, label: 'Read', color: 'text-amber-500' },
  replied: { icon: CheckCircle2, label: 'Replied', color: 'text-emerald-500' },
  resolved: { icon: CheckCircle2, label: 'Resolved', color: 'text-gray-400' },
  escalated: { icon: AlertCircle, label: 'Escalated', color: 'text-orange-500' },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 ring-1 ring-red-200/30',
  high: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/30',
  normal: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200/30',
  low: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/30',
};

// ── Filters ──

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'replied', label: 'Replied' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'escalated', label: 'Escalated' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const PLATFORM_OPTIONS = [
  { value: '', label: 'All Platforms' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'chatwoot', label: 'Chatwoot' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200/30',
  facebook: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/30',
  chatwoot: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/30',
  messenger: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/30',
  whatsapp: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/30',
};

// ── Main Component ──

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail panel
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // AI Copilot
  const [copilotSuggestions, setCopilotSuggestions] = useState<string[]>([]);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // Chatwoot integration
  const [chatwootStatus, setChatwootStatus] = useState<{ configured: boolean } | null>(null);
  const [syncingChatwoot, setSyncingChatwoot] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── WebSocket real-time updates ──
  useWebSocket({
    onEvent: (event) => {
      switch (event.type) {
        case 'inbox:new': {
          const msg = event.payload.inbox;
          if (msg) {
            toast(`💬 New message from ${msg.customerName || msg.customerHandle}`, {
              description: msg.content?.slice(0, 100),
              action: {
                label: 'View',
                onClick: () => window.location.href = '/inbox',
              },
            });
            // Refresh silently (only if not filtered away from new items)
            if (!statusFilter && !platformFilter && page === 1) {
              loadData(page);
            }
          }
          break;
        }
        case 'inbox:escalated': {
          const e = event.payload.inbox;
          if (e) {
            toast.error(`🚨 Escalation: ${e.customerName || e.customerHandle}`, {
              description: e.content?.slice(0, 100),
            });
            loadData(page);
          }
          break;
        }
        case 'inbox:status_change': {
          // Silently refresh on status changes made by other sessions
          loadData(page);
          break;
        }
      }
    },
  });

  const loadData = useCallback(async (p: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    if (platformFilter) params.set('platform', platformFilter);
    if (searchQuery) params.set('search', searchQuery);
    params.set('page', String(p));
    params.set('limit', '20');

    try {
      const res = await api.get<any>(`/api/inbox?${params.toString()}`) as any;
      if (res.success) {
        setItems(res.data || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      } else {
        toast.error('Failed to load inbox');
      }
    } catch {
      toast.error('Network error loading inbox');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, platformFilter, searchQuery]);

  // Check Chatwoot config on mount
  useEffect(() => {
    api.get<any>('/api/chatwoot/status').then((res) => {
      if (res.success) setChatwootStatus(res.data);
    }).catch(() => {});
  }, []);

  // Initial load + filter change — also clears detail panel
  useEffect(() => {
    setSelectedItem(null);
    setLoading(true);
    setPage(1);
    loadData(1);
  }, [loadData]);

  // Pagination
  useEffect(() => {
    if (page > 1) loadData(page);
  }, [page, loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      loadData(page);
    }, 30000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [loadData, page]);

  // ── Actions ──

  const handleRefresh = () => {
    loadData(page);
  };

  const handleChatwootSync = async () => {
    setSyncingChatwoot(true);
    try {
      const res = await api.post('/api/chatwoot/sync');
      if (res.success) {
        toast.success(`Synced ${(res as any).imported} Chatwoot conversations`);
        loadData(page);
      } else {
        toast.error(res.error || 'Failed to sync Chatwoot');
      }
    } catch {
      toast.error('Network error syncing Chatwoot');
    } finally {
      setSyncingChatwoot(false);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleBulkMarkRead = async () => {
    await Promise.allSettled(
      [...selectedIds].map(id => api.put(`/api/inbox/${id}/status`, { status: 'read' }))
    );
    toast.success(`${selectedIds.size} marked as read`);
    setSelectedIds(new Set());
    loadData(page);
  };

  const handleBulkResolve = async () => {
    await Promise.allSettled(
      [...selectedIds].map(id => api.put(`/api/inbox/${id}/status`, { status: 'resolved' }))
    );
    toast.success(`${selectedIds.size} resolved`);
    setSelectedIds(new Set());
    loadData(page);
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await api.put(`/api/inbox/${id}/status`, { status });
      if (res.success) {
        toast.success(`Status updated to ${status}`);
        loadData(page);
        if (selectedItem?.id === id) {
          setSelectedItem((prev) => prev ? { ...prev, status } : null);
        }
      }
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleAssign = async (id: string) => {
    const name = prompt('Assign to:');
    if (!name) return;
    try {
      const res = await api.put(`/api/inbox/${id}/assign`, { assignedTo: name });
      if (res.success) {
        toast.success(`Assigned to ${name}`);
        loadData(page);
      }
    } catch {
      toast.error('Failed to assign');
    }
  };

  const handleQuickReply = async () => {
    if (!selectedItem || !replyText.trim()) return;
    setSendingReply(true);
    try {
      // In a real implementation, this would post the reply to the platform
      await api.put(`/api/inbox/${selectedItem.id}/status`, { status: 'replied' });
      toast.success('Reply sent!');
      setReplyText('');
      loadData(page);
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  // ── Compute stats ──

  const unreadCount = items.filter((i) => i.status === 'unread').length;
  const urgentCount = items.filter((i) => i.priority === 'urgent').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
            {unreadCount > 0 && (
              <span className="text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full ring-1 ring-red-200/30">
                {unreadCount} unread
              </span>
            )}
            {urgentCount > 0 && (
              <span className="text-xs font-medium bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full ring-1 ring-orange-200/30">
                {urgentCount} urgent
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">{total} total conversations</p>
        </div>
        <div className="flex items-center gap-2">
          {chatwootStatus?.configured && (
            <button
              onClick={handleChatwootSync}
              disabled={syncingChatwoot}
              className="flex items-center gap-2 px-4 py-2 border border-purple-200 rounded-lg text-sm text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all disabled:opacity-50"
            >
              <Download size={16} className={syncingChatwoot ? 'animate-bounce' : ''} />
              {syncingChatwoot ? 'Syncing...' : 'Sync Chatwoot'}
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Chatwoot config banner */}
      {chatwootStatus && !chatwootStatus.configured && (
        <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm">
          <Bot size={18} className="text-purple-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-purple-900 font-medium">Chatwoot Unified Inbox</p>
            <p className="text-purple-700 text-xs mt-0.5">
              Connect Chatwoot to see your multi-channel conversations here. Set{' '}
              <code className="bg-purple-100 px-1 rounded text-xs">CHATWOOT_BASE_URL</code>,
              <code className="bg-purple-100 px-1 rounded text-xs">CHATWOOT_ACCOUNT_ID</code>, and
              <code className="bg-purple-100 px-1 rounded text-xs">CHATWOOT_ACCESS_TOKEN</code> in your .env.
            </p>
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Platform filter */}
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm text-gray-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
        >
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
            <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
            <button
              onClick={handleBulkMarkRead}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <CheckCircle2 size={14} /> Mark Read
            </button>
            <button
              onClick={handleBulkResolve}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <CheckCircle2 size={14} /> Resolve
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex gap-6">
        {/* List */}
        <div className={`${selectedItem ? 'w-1/2' : 'w-full'} transition-all duration-300`}>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-1 hover:text-gray-700 transition-colors"
              >
                {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                Select All
              </button>
              <span className="ml-auto">{total} items</span>
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <Inbox size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Inbox is empty</h3>
                <p className="text-gray-500 mt-1 text-sm">
                  {searchQuery || statusFilter || priorityFilter
                    ? 'No items match your filters. Try adjusting them.'
                    : 'New conversations will appear here as your AI engages with customers.'}
                </p>
                {(searchQuery || statusFilter || priorityFilter) && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter(''); setPriorityFilter(''); }}
                    className="mt-4 text-sm text-primary hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-50 max-h-[65vh] overflow-y-auto">
                  {items.map((item, idx) => {
                    const StatusIcon = STATUS_CONFIG[item.status]?.icon || Clock;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-4 cursor-pointer transition-all duration-150 ${
                          selectedItem?.id === item.id
                            ? 'bg-primary-50 border-l-2 border-primary'
                            : 'hover:bg-gray-50 border-l-2 border-transparent'
                        } ${item.status === 'unread' ? 'bg-blue-50/30' : ''}`}
                        style={{ animationDelay: `${idx * 30}ms` }}
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => handleSelect(item.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary/30"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <StatusIcon size={14} className={STATUS_CONFIG[item.status]?.color || 'text-gray-400'} />
                            <span className="font-medium text-sm text-gray-900 truncate">
                              {item.customerName || item.customerHandle}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal}`}>
                              {item.priority}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{item.content}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[item.platform] || 'bg-gray-100 text-gray-500 ring-1 ring-gray-200/30'}`}>
                              {item.platform === 'chatwoot' && <Bot size={10} className="inline mr-0.5" />}
                              {item.platform}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(item.createdAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            {item.assignedTo && (
                              <span className="text-xs text-primary flex items-center gap-0.5">
                                <UserCheck size={12} /> {item.assignedTo}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                    <span className="text-xs text-gray-500">
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <div className="w-1/2 transition-all duration-300">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {selectedItem.customerName || selectedItem.customerHandle}
                  </h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[selectedItem.priority] || PRIORITY_COLORS.normal}`}>
                    {selectedItem.priority}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Platform & Status */}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{selectedItem.platform}</span>
                  <span className={STATUS_CONFIG[selectedItem.status]?.color || 'text-gray-500'}>
                    {STATUS_CONFIG[selectedItem.status]?.label || selectedItem.status}
                  </span>
                  <span>{new Date(selectedItem.createdAt).toLocaleString()}</span>
                </div>

                {/* Message content */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-1">{selectedItem.customerHandle}</p>
                  <p className="text-sm text-gray-600">{selectedItem.content}</p>
                </div>

                {/* AI Suggested Reply */}
                {selectedItem.aiSuggestedReply && (
                  <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
                    <p className="text-xs font-medium text-primary mb-1">AI Suggested Reply</p>
                    <p className="text-sm text-gray-700">{selectedItem.aiSuggestedReply}</p>
                  </div>
                )}

                {/* Quick reply */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Quick Reply</label>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      selectedItem.aiSuggestedReply
                        ? 'Edit AI suggested reply or type your own...'
                        : 'Type your reply...'
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none transition-all"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <button
                      onClick={() => setReplyText(selectedItem.aiSuggestedReply || '')}
                      className="text-xs text-primary hover:underline"
                      disabled={!selectedItem.aiSuggestedReply}
                    >
                      Use AI suggestion
                    </button>
                    <button
                      onClick={handleQuickReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-primary-200/50"
                    >
                      {sendingReply ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      Send Reply
                    </button>
                  </div>
                </div>

                {/* AI Copilot Suggestions */}
                {copilotSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-violet-700 flex items-center gap-1">
                      <Zap size={12} /> AI Copilot Suggestions
                    </p>
                    {copilotSuggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => setReplyText(suggestion)}
                        className="w-full text-left p-2 bg-violet-50 border border-violet-100 rounded-lg text-sm text-gray-700 hover:bg-violet-100 transition-colors"
                      >
                        {suggestion.slice(0, 150)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick actions */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleStatusChange(selectedItem.id, 'replied')}
                    disabled={selectedItem.status === 'replied'}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} /> Mark Replied
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedItem.id, 'resolved')}
                    disabled={selectedItem.status === 'resolved'}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                  <button
                    onClick={() => handleAssign(selectedItem.id)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <UserCheck size={14} /> Assign
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedItem) return;
                      setCopilotLoading(true);
                      try {
                        const copilotRes: any = await api.post('/api/automation/copilot', {
                          content: selectedItem.content,
                          context: {
                            platform: selectedItem.platform,
                            customerName: selectedItem.customerName,
                            customerHandle: selectedItem.customerHandle,
                            previousMessages: [],
                          },
                          style: 'friendly',
                          count: 3,
                        });
                        if (copilotRes.success) {
                          setCopilotSuggestions(copilotRes.data.suggestions.map((s: any) => s.raw));
                        }
                      } catch {}
                      setCopilotLoading(false);
                    }}
                    disabled={copilotLoading || !selectedItem}
                    className="flex items-center gap-1 px-3 py-1.5 border border-violet-200 rounded-lg text-xs text-violet-700 hover:bg-violet-50 transition-colors disabled:opacity-40"
                  >
                    {copilotLoading ? (
                      <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Zap size={14} />
                    )}
                    AI Copilot
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedItem.id, 'escalated')}
                    disabled={selectedItem.status === 'escalated'}
                    className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-orange-700 hover:bg-orange-50 transition-colors disabled:opacity-40"
                  >
                    <AlertCircle size={14} /> Escalate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
