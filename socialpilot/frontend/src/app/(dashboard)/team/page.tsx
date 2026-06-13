'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { UserCog, Plus, Mail, Shield, User, X, Loader2 } from 'lucide-react';
import ActivityFeed from '@/components/ActivityFeed';

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('sales_agent');
  const [error, setError] = useState('');

  const loadMembers = () => {
    api.get<any[]>('/api/team').then((res) => {
      if (res.success && res.data) setMembers(res.data as any[]);
      setLoading(false);
    });
  };

  useEffect(() => { loadMembers(); }, []);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setError('');
    const res = await api.post('/api/team/invite', { email: inviteEmail, role: inviteRole });
    if (res.success) {
      setInviteEmail('');
      setShowInvite(false);
      loadMembers();
    } else {
      setError(res.error || 'Failed to invite member');
    }
  };

  const handleRemove = async (id: string) => {
    const res = await api.delete(`/api/team/${id}`);
    if (res.success) loadMembers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 mt-1">Manage team members and permissions</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={16} /> Invite Member
        </button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
              <button onClick={() => setShowInvite(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="sales_agent">Sales Agent</option>
                  <option value="support_agent">Support Agent</option>
                </select>
              </div>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Current Team</h2>
          <p className="text-sm text-gray-500 mt-1">{members.length} member{members.length > 1 ? 's' : ''}</p>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8">
              <User size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No team members yet</p>
              <p className="text-xs text-gray-400 mt-1">Invite team members to collaborate</p>
            </div>
          ) : (
            members.map((member: any) => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-50 rounded-full flex items-center justify-center">
                    <User size={18} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{member.member?.name || 'Unknown'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Mail size={12} className="text-gray-400" />
                      <span className="text-xs text-gray-500">{member.member?.email}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded capitalize">
                    {member.role?.replace('_', ' ')}
                  </span>
                  {member.status === 'active' ? (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-amber-50 text-amber-600 px-2 py-1 rounded">Pending</span>
                  )}
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <ActivityFeed />
    </div>
  );
}
