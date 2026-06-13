'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Users, Search, Filter, Phone, Mail, Globe, Star } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const params = category !== 'all' ? `?category=${category}` : '';
    api.get<any[]>(`/api/leads${params}`).then((res) => {
      if (res.success && res.data) setLeads(res.data as any[]);
      setLoading(false);
    });
  }, [category]);

  const categoryColor = (cat: string) => {
    switch (cat) {
      case 'hot': return 'text-red-600 bg-red-50';
      case 'warm': return 'text-amber-600 bg-amber-50';
      case 'cold': return 'text-blue-600 bg-blue-50';
      case 'vip': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500 mt-1">Track and manage your leads</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-2">
        {['all', 'hot', 'warm', 'cold', 'vip'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              category === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'vip' ? 'VIP' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
            <Users size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No leads yet</p>
            <p className="text-sm text-gray-400 mt-1">Leads will appear once AI engages with customers</p>
          </div>
        ) : (
          leads.map((lead: any) => (
            <div key={lead.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{lead.name || lead.socialHandle}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(lead.category)}`}>
                      {lead.category.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">@{lead.socialHandle} · {lead.platform}</p>
                  
                  <div className="flex flex-wrap gap-3 mt-3">
                    {lead.email && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Mail size={12} /> {lead.email}
                      </span>
                    )}
                    {lead.phone && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Phone size={12} /> {lead.phone}
                      </span>
                    )}
                    {lead.leadScore > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Star size={12} className="text-amber-500" /> Score: {lead.leadScore}
                      </span>
                    )}
                  </div>

                  {lead.requirement && (
                    <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">
                      {lead.requirement}
                    </p>
                  )}

                  {lead.tags && lead.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {lead.tags.map((tag: string) => (
                        <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {tag.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(lead.lastContactAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Source: {lead.source}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
