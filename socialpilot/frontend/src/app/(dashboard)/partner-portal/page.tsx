'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Users, Building2, IndianRupee, TrendingUp, Percent,
  Loader2, RefreshCw, AlertTriangle, CheckCircle,
  ChevronRight, ExternalLink, Calendar, Phone, MapPin,
} from 'lucide-react';

type PartnerStats = {
  totalCustomers: number;
  activeCustomers: number;
  mrr: number;
  commissionRate: number;
  commissionEarned: number;
};

type Customer = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  subscription: {
    plan: string;
    status: string;
  } | null;
};

type PartnerData = {
  partner: {
    id: string;
    name: string;
    city: string | null;
    territory: string | null;
    commissionRate: number;
  };
  stats: PartnerStats;
  customers: Customer[];
};

export default function PartnerPortalPage() {
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPortal();
  }, []);

  const loadPortal = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<any>('/api/partners/portal');
      if (res.success && res.data) {
        setData(res.data);
      } else {
        // Maybe the user is admin — try listing partners instead
        const adminRes = await api.get<any>('/api/partners');
        if (adminRes.success && adminRes.data?.length > 0) {
          // Show the first partner for now
          const first = await api.get<any>(`/api/partners/${adminRes.data[0].id}`);
          if (first.success) setData(first.data);
        }
      }
    } catch {
      setError('Unable to load partner portal. Contact support.');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-600 font-medium">{error}</p>
        <button onClick={loadPortal} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90">
          Try Again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Users size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">No Partner Portal Access</h2>
        <p className="text-gray-500 text-sm mt-1">Contact the admin to set up your partner account.</p>
      </div>
    );
  }

  const { partner, stats, customers } = data;
  const formatCurrency = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partner Portal</h1>
            <p className="text-sm text-gray-500">{partner.name} &middot; {partner.city || partner.territory || 'All India'}</p>
          </div>
        </div>
        <button onClick={loadPortal} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
          <RefreshCw size={18} className="text-gray-400" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Users size={18} className="text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.totalCustomers}</p>
          <p className="text-xs text-gray-500">Total Clients</p>
          <p className="text-[10px] text-emerald-600 mt-1">{stats.activeCustomers} active</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <IndianRupee size={18} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.mrr)}</p>
          <p className="text-xs text-gray-500">Monthly Recurring Revenue</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Percent size={18} className="text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.commissionRate}%</p>
          <p className="text-xs text-gray-500">Commission Rate</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <TrendingUp size={18} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.commissionEarned)}</p>
          <p className="text-xs text-gray-500">Commission Earned</p>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">My Clients</h2>
          </div>
          <span className="text-xs text-gray-500">{customers.length} client{customers.length !== 1 ? 's' : ''}</span>
        </div>

        {customers.length === 0 ? (
          <div className="p-10 text-center">
            <Users size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">No clients assigned yet</p>
            <p className="text-xs text-gray-400 mt-1">Clients referred through your partner link will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {customers.map((customer) => (
              <div key={customer.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                    customer.subscription?.status === 'active'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-gray-50 text-gray-400'
                  }`}>
                    {customer.name?.charAt(0) || customer.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {customer.name || 'Unnamed Client'}
                    </p>
                    <p className="text-xs text-gray-500">{customer.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">
                        <Calendar size={10} className="inline mr-1" />
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </span>
                      {customer.subscription && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          customer.subscription.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-50 text-gray-500'
                        }`}>
                          {customer.subscription.plan} &middot; {customer.subscription.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Partner Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Partner Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-1">Name</p>
            <p className="font-medium text-gray-700">{partner.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">City</p>
            <p className="font-medium text-gray-700 flex items-center gap-1">
              <MapPin size={12} className="text-gray-400" />
              {partner.city || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Territory</p>
            <p className="font-medium text-gray-700">{partner.territory || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Commission Rate</p>
            <p className="font-medium text-emerald-600">{partner.commissionRate}% on MRR</p>
          </div>
        </div>
      </div>
    </div>
  );
}
