'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Activity, Loader2, UserPlus, UserMinus, Settings, Key, Webhook, Shield } from 'lucide-react';

const actionIcons: Record<string, React.ReactNode> = {
  'invite': <UserPlus size={14} />,
  'remove': <UserMinus size={14} />,
  'update_role': <Shield size={14} />,
  'create_api_key': <Key size={14} />,
  'revoke_api_key': <Key size={14} />,
  'create_webhook': <Webhook size={14} />,
  'delete_webhook': <Webhook size={14} />,
  'update_settings': <Settings size={14} />,
};

const actionLabels: Record<string, string> = {
  'invite': 'invited a team member',
  'remove': 'removed a team member',
  'update_role': 'updated a team role',
  'create_api_key': 'created an API key',
  'revoke_api_key': 'revoked an API key',
  'create_webhook': 'created a webhook',
  'delete_webhook': 'deleted a webhook',
  'update_settings': 'updated settings',
};

export default function ActivityFeed() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/activity').then((res: any) => {
      if (res.success) setActivities(res.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={18} className="text-primary" />
        <h2 className="font-semibold text-gray-900">Activity Feed</h2>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
        ) : activities.length === 0 ? (
          <div className="text-center py-6">
            <Activity size={24} className="mx-auto text-gray-300 mb-1" />
            <p className="text-xs text-gray-500">No recent activity</p>
          </div>
        ) : (
          activities.map((activity) => {
            const Icon = actionIcons[activity.action] || <Activity size={14} />;
            const label = actionLabels[activity.action] || activity.action;
            return (
              <div key={activity.id} className="flex items-start gap-3 p-2.5 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  {Icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{activity.actorId?.substring(0, 8)}</span>
                    {' '}{label}{' '}
                    <span className="text-gray-400">{activity.resource}</span>
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(activity.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
