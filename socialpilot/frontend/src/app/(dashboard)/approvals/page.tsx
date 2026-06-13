'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useWebSocket } from '@/lib/use-websocket';
import {
  Shield, Check, X, Edit3, Clock, AlertCircle, ChevronDown,
  ThumbsUp, ThumbsDown, FileEdit,
} from 'lucide-react';

// ── Helpers ──

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-200/50';
    case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200/50';
    case 'rejected': return 'bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200/50';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

const confidenceColor = (score: number) => {
  if (score >= 0.8) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 0.5) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
};

const confidenceLabel = (score: number) => {
  if (score >= 0.8) return 'High';
  if (score >= 0.5) return 'Medium';
  return 'Low';
};

// ── Skeleton ──

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>
      <div className="mb-3">
        <div className="h-3 w-24 bg-gray-200 rounded mb-1" />
        <div className="h-8 w-full bg-gray-100 rounded" />
      </div>
      <div className="h-3 w-16 bg-gray-200 rounded mb-1" />
      <div className="h-8 w-full bg-gray-100 rounded mb-3" />
      <div className="flex gap-2 pt-2 border-t border-gray-50">
        <div className="h-8 w-20 bg-gray-200 rounded" />
        <div className="h-8 w-16 bg-gray-200 rounded" />
        <div className="h-8 w-24 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// ── Component ──

export default function ApprovalsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const params = filter !== 'all' ? `?status=${filter}` : '';
    try {
      const [itemsRes, statsRes] = await Promise.all([
        api.get<any>(`/api/approvals${params}`),
        api.get<any>('/api/approvals/stats'),
      ]);
      if (itemsRes.success && itemsRes.data) setItems(itemsRes.data);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    } catch (err) {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  // ── WebSocket real-time notifications ──
  useWebSocket({
    onEvent: (event) => {
      switch (event.type) {
        case 'approval:new': {
          const a = event.payload.approval;
          if (a) {
            toast(`📝 New approval request from ${a.customerName || a.platform}`, {
              description: a.originalMessage?.slice(0, 100),
              action: {
                label: 'Review',
                onClick: () => window.location.href = '/approvals',
              },
            });
            if (filter === 'pending' || filter === 'all') {
              loadData();
            }
          }
          break;
        }
        case 'approval:status_change': {
          // Refresh when another session approves/rejects
          loadData();
          break;
        }
      }
    },
  });

  const handleApprove = async (id: string, editContentArg?: string) => {
    setActionLoading(id);
    try {
      const body = editContentArg ? { draftContent: editContentArg } : {};
      const res = await api.post(`/api/approvals/${id}/approve`, body);
      if (res.success) {
        toast.success('Draft approved!');
        setEditingId(null);
      } else {
        toast.error(res.error || 'Failed to approve');
      }
    } catch {
      toast.error('Network error approving draft');
    } finally {
      setActionLoading(null);
      loadData();
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt('Reason for rejection (optional):');
    if (note === null) return; // user cancelled
    setActionLoading(id);
    try {
      const res = await api.post(`/api/approvals/${id}/reject`, { reviewNote: note || undefined });
      if (res.success) {
        toast.success('Draft rejected');
      } else {
        toast.error(res.error || 'Failed to reject');
      }
    } catch {
      toast.error('Network error rejecting draft');
    } finally {
      setActionLoading(null);
      loadData();
    }
  };

  const handleEditPublish = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await api.post(`/api/approvals/${id}/edit-publish`, { draftContent: editContent });
      if (res.success) {
        toast.success('Edits published!');
        setEditingId(null);
      } else {
        toast.error(res.error || 'Failed to publish');
      }
    } catch {
      toast.error('Network error publishing edits');
    } finally {
      setActionLoading(null);
      loadData();
    }
  };

  const filters = ['all', 'pending', 'approved', 'rejected'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approvals Queue</h1>
        <p className="text-gray-500 mt-1">Review AI-generated drafts before publishing</p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Pending" value={stats.pending} color="amber" />
          <StatCard label="Approved" value={stats.approved} color="emerald" />
          <StatCard label="Rejected" value={stats.rejected} color="red" />
          <StatCard label="Approval Rate" value={`${stats.approvalRate}%`} color="primary" />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              filter === f
                ? 'bg-white shadow-sm text-gray-900 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Approval items */}
      <div className="space-y-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
            <Shield size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No items to review</h3>
            <p className="text-gray-500 mt-1">
              {filter === 'pending'
                ? 'All AI drafts have been reviewed. Great work!'
                : `No ${filter} items yet`}
            </p>
          </div>
        ) : (
          items.map((item: any) => (
            <ApprovalCard
              key={item.id}
              item={item}
              editingId={editingId}
              editContent={editContent}
              actionLoading={actionLoading}
              onStartEdit={(id, content) => { setEditingId(id); setEditContent(content); }}
              onCancelEdit={() => { setEditingId(null); setEditContent(''); }}
              onEditContentChange={setEditContent}
              onApprove={handleApprove}
              onReject={handleReject}
              onEditPublish={handleEditPublish}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function StatCard({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-white text-gray-900 border-gray-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    primary: 'bg-primary-50 text-primary border-primary-100',
  };
  return (
    <div className={`rounded-xl border p-4 transition-all hover:shadow-sm ${colorMap[color] || colorMap.gray}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-70">{label}</p>
    </div>
  );
}

function ApprovalCard({
  item, editingId, editContent, actionLoading,
  onStartEdit, onCancelEdit, onEditContentChange,
  onApprove, onReject, onEditPublish,
}: {
  item: any; editingId: string | null; editContent: string; actionLoading: string | null;
  onStartEdit: (id: string, content: string) => void;
  onCancelEdit: () => void;
  onEditContentChange: (val: string) => void;
  onApprove: (id: string, content?: string) => void;
  onReject: (id: string) => void;
  onEditPublish: (id: string) => void;
}) {
  const isEditing = editingId === item.id;
  const isLoading = actionLoading === item.id;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all duration-200">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${statusBadge(item.status)}`}>
            {item.status}
          </div>
          <span className="text-sm text-gray-500">
            {item.platform} · {item.customerName || item.customerId?.slice(0, 12)}
          </span>
          {item.confidenceScore != null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${confidenceColor(item.confidenceScore)}`}>
              {confidenceLabel(item.confidenceScore)} · {Math.round(item.confidenceScore * 100)}%
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Original message */}
      {item.originalMessage && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
            <AlertCircle size={12} /> Original Message
          </p>
          <p className="text-sm text-gray-600 bg-gray-50 p-2.5 rounded-lg">{item.originalMessage}</p>
        </div>
      )}

      {/* AI Draft */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1">
          <FileEdit size={12} /> AI Draft
        </p>
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            className="w-full px-3 py-2 border-2 border-primary/40 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            rows={3}
            autoFocus
          />
        ) : (
          <p className="text-sm text-gray-900 bg-primary-50/50 p-2.5 rounded-lg border border-primary-100/50">
            {item.draftContent}
          </p>
        )}
      </div>

      {/* Actions */}
      {item.status === 'pending' && (
        <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
          {isEditing ? (
            <>
              <button
                onClick={() => onEditPublish(item.id)}
                disabled={isLoading || !editContent.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? <Spinner /> : <Check size={14} />}
                Publish Edit
              </button>
              <button
                onClick={onCancelEdit}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onApprove(item.id)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-200/50"
              >
                {isLoading ? <Spinner /> : <ThumbsUp size={14} />}
                Approve
              </button>
              <button
                onClick={() => onReject(item.id)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-200/50"
              >
                <ThumbsDown size={14} /> Reject
              </button>
              <button
                onClick={() => onStartEdit(item.id, item.draftContent)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
              >
                <Edit3 size={14} /> Edit & Publish
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />;
}
