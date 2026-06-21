'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  CreditCard, CheckCircle, XCircle, Download, ArrowUpCircle,
  ArrowDownCircle, AlertTriangle, Loader2, Receipt, Clock,
  Shield, Star, Zap, Crown, Building2, ChevronRight, Info,
} from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  limits: Record<string, number>;
  popular: boolean;
};

type Subscription = {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  razorpaySubscriptionId: string | null;
};

type Invoice = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  periodStart: string | null;
  periodEnd: string | null;
  invoiceUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

type UsageData = {
  plan: string;
  planName: string;
  periodsRemaining: number;
  metrics: Array<{
    key: string;
    label: string;
    used: number;
    limit: number;
    percentage: number;
    warning: string;
  }>;
};

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [gstNumber, setGstNumber] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<any>('/api/subscription/plans'),
      api.get<any>('/api/subscription/current'),
      api.get<any>('/api/subscription/billing-history'),
      api.get<any>('/api/subscription/usage'),
    ]).then(([plansRes, subRes, invRes, usageRes]) => {
      if (plansRes.success) setPlans(plansRes.data);
      if (subRes.success) setSubscription(subRes.data);
      if (invRes.success) setInvoices(invRes.data || []);
      if (usageRes.success) setUsage(usageRes.data);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load billing data');
      setLoading(false);
    });
  }, []);

  const openRazorpay = async (planId: string, planPrice: number) => {
    setActionLoading(planId);
    setError(null);

    // Create order
    const orderRes = await api.post<any>('/api/subscription/create-order', { planId });
    if (!orderRes.success || !orderRes.data) {
      setError(orderRes.error || 'Failed to create order');
      setActionLoading(null);
      return;
    }

    const { orderId, amount, currency, keyId, name, description, prefill } = orderRes.data;

    // Load Razorpay script if not loaded
    if (!window.Razorpay) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        document.body.appendChild(script);
      });
    }

    const options = {
      key: keyId,
      amount,
      currency: currency || 'INR',
      name: name || 'KluConnect',
      description: description || `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
      order_id: orderId,
      prefill: prefill || { contact: '', email: '' },
      notes: {
        plan_id: planId,
        gst_number: gstNumber,
      },
      handler: async function (response: any) {
        // Verify payment on backend
        const verifyRes = await api.post('/api/subscription/verify', {
          planId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });

        if (verifyRes.success) {
          setSuccess(`Successfully upgraded to ${planId.charAt(0).toUpperCase() + planId.slice(1)} plan!`);
          // Refresh subscription
          const subRes = await api.get<any>('/api/subscription/current');
          if (subRes.success) setSubscription(subRes.data);
          // Refresh usage
          const usageRes = await api.get<any>('/api/subscription/usage');
          if (usageRes.success) setUsage(usageRes.data);
          // Refresh invoices
          const invRes = await api.get<any>('/api/subscription/billing-history');
          if (invRes.success) setInvoices(invRes.data || []);
        } else {
          setError(verifyRes.error || 'Payment verification failed');
        }
        setActionLoading(null);
      },
      modal: {
        ondismiss: function () {
          setActionLoading(null);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will be downgraded to the Free plan at the end of the current billing period.')) return;
    setActionLoading('cancel');
    setError(null);

    const res = await api.post('/api/subscription/cancel');
    if (res.success) {
      setSuccess('Subscription canceled. You will be downgraded to Free at the end of the billing period.');
      const subRes = await api.get<any>('/api/subscription/current');
      if (subRes.success) setSubscription(subRes.data);
    } else {
      setError(res.error || 'Cancellation failed');
    }
    setActionLoading(null);
  };

  const handleDowngrade = async () => {
    if (!confirm('This will immediately downgrade you to the Free plan. All premium features will be disabled. Continue?')) return;
    setActionLoading('downgrade');
    setError(null);

    const res = await api.post('/api/subscription/downgrade', { planId: 'free' });
    if (res.success) {
      setSuccess('Downgraded to Free plan.');
      const subRes = await api.get<any>('/api/subscription/current');
      if (subRes.success) setSubscription(subRes.data);
      const usageRes = await api.get<any>('/api/subscription/usage');
      if (usageRes.success) setUsage(usageRes.data);
    } else {
      setError(res.error || 'Downgrade failed');
    }
    setActionLoading(null);
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const res = await api.get<any>(`/api/subscription/invoice/${invoiceId}`);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      // If API returns 404 or error, we'll just indicate it's not available yet
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-80 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'free';
  const planDetails = plans.find(p => p.id === currentPlan) || plans.find(p => p.id === 'free');
  const isCanceled = subscription?.status === 'canceled' || !!subscription?.canceledAt;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <CreditCard size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
            <p className="text-sm text-gray-500">Manage your plan, payments, and billing history</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
          <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* Current Plan Card */}
      {subscription && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${
                currentPlan === 'agency' ? 'bg-purple-50' :
                currentPlan === 'professional' || currentPlan === 'starter' ? 'bg-primary-50' :
                'bg-gray-50'
              }`}>
                {currentPlan === 'agency' ? <Building2 size={24} className="text-purple-600" /> :
                 currentPlan === 'professional' ? <Zap size={24} className="text-primary" /> :
                 currentPlan === 'starter' ? <Star size={24} className="text-amber-500" /> :
                 <Crown size={24} className="text-gray-400" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 capitalize">{currentPlan} Plan</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {planDetails?.description || ''}
                </p>
                {isCanceled && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium">
                    <AlertTriangle size={14} />
                    Canceled — active until {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'end of period'}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Receipt size={12} /> Started {new Date(subscription.currentPeriodStart).toLocaleDateString()}</span>
                  {subscription.currentPeriodEnd && (
                    <span className="flex items-center gap-1"><Clock size={12} /> Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    subscription.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                    subscription.status === 'canceled' ? 'bg-amber-50 text-amber-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {subscription.status}
                  </span>
                </div>
              </div>
            </div>
            {currentPlan !== 'free' && !isCanceled && (
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={actionLoading === 'cancel'}
                  className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'cancel' ? <Loader2 size={14} className="animate-spin" /> : 'Cancel Plan'}
                </button>
              </div>
            )}
            {currentPlan !== 'free' && isCanceled && (
              <button onClick={handleDowngrade} disabled={actionLoading === 'downgrade'} className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                {actionLoading === 'downgrade' ? <Loader2 size={14} className="animate-spin" /> : 'Downgrade to Free'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Plan Cards */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Choose Your Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.filter(p => p.id !== 'free').map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isDowngrade = plan.id === 'starter' && (currentPlan === 'professional' || currentPlan === 'agency');
            const isUpgrade = (currentPlan === 'free' || currentPlan === 'starter') && (plan.id === 'professional' || plan.id === 'agency') ||
                              currentPlan === 'starter' && plan.id === 'agency';

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-xl border-2 transition-all hover:shadow-lg ${
                  isCurrent ? 'border-primary shadow-md' :
                  plan.popular ? 'border-amber-200' : 'border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full shadow-sm">
                    MOST POPULAR
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute top-3 right-3 px-2 py-0.5 bg-primary-50 text-primary text-xs font-medium rounded-full">
                    Current
                  </div>
                )}

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    {plan.id === 'starter' && <Star size={20} className="text-amber-500" />}
                    {plan.id === 'professional' && <Zap size={20} className="text-primary" />}
                    {plan.id === 'agency' && <Building2 size={20} className="text-purple-600" />}
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-bold text-gray-900">₹{plan.price.toLocaleString('en-IN')}</span>
                    <span className="text-gray-500 text-sm">/month</span>
                    {plan.id === 'agency' && <span className="text-xs text-gray-400 ml-2">+ GST</span>}
                  </div>

                  <p className="text-sm text-gray-600 mb-4">{plan.description}</p>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="w-full py-2.5 text-center text-sm font-medium text-primary bg-primary-50 rounded-lg">
                      {isCanceled ? 'Expiring' : 'Current Plan'}
                    </div>
                  ) : (
                    <button
                      onClick={() => openRazorpay(plan.id, plan.price)}
                      disabled={actionLoading === plan.id}
                      className="w-full py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading === plan.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : isDowngrade ? (
                        'Downgrade'
                      ) : (
                        <>
                          {isUpgrade ? 'Upgrade' : 'Subscribe'}
                          <ChevronRight size={16} />
                        </>
                      )}
                    </button>
                  )}

                  {isDowngrade && (
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Losing features: {currentPlan === 'professional' ? 'Unlimited leads, team' : 'Unlimited everything'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GST Input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <Receipt size={16} className="text-gray-400" />
          GST Number (optional for business billing)
        </label>
        <input
          type="text"
          value={gstNumber}
          onChange={(e) => setGstNumber(e.target.value)}
          placeholder="Enter your GSTIN for tax invoice"
          className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Billing History</h2>
          </div>
          <span className="text-xs text-gray-500">{invoices.length} invoices</span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center">
            <Receipt size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No billing history yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    inv.status === 'paid' ? 'bg-emerald-50' : inv.status === 'failed' ? 'bg-red-50' : 'bg-gray-50'
                  }`}>
                    {inv.status === 'paid' ? <CheckCircle size={16} className="text-emerald-500" /> :
                     inv.status === 'failed' ? <XCircle size={16} className="text-red-500" /> :
                     <Clock size={16} className="text-gray-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">{inv.plan} Plan</p>
                    <p className="text-xs text-gray-500">
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : new Date(inv.createdAt).toLocaleDateString()} 
                      {inv.periodStart && inv.periodEnd && ` • ${new Date(inv.periodStart).toLocaleDateString()} - ${new Date(inv.periodEnd).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">
                    ₹{(inv.amount / 100).toLocaleString('en-IN')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                    inv.status === 'failed' ? 'bg-red-50 text-red-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {inv.status}
                  </span>
                  {inv.status === 'paid' && (
                    <button
                      onClick={() => handleDownloadInvoice(inv.id)}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="Download Invoice"
                    >
                      <Download size={14} className="text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Dashboard */}
      {usage && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Usage & Quotas</h2>
          </div>
          <div className="p-4 space-y-4">
            {usage.metrics.map((metric) => {
              const isUnlimited = metric.limit >= 999999;
              const isExceeded = metric.warning === 'exceeded';
              const isWarning80 = metric.warning === 'warning_80';
              const isWarning90 = metric.warning === 'warning_90';
              const barColor = isExceeded ? 'bg-red-500' : isWarning90 ? 'bg-orange-500' : isWarning80 ? 'bg-amber-500' : 'bg-primary';

              return (
                <div key={metric.key}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{metric.label}</span>
                      {isExceeded && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 rounded">EXCEEDED</span>}
                      {isWarning90 && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-50 text-orange-700 rounded">90%</span>}
                      {isWarning80 && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 rounded">80%</span>}
                    </div>
                    <span className="text-sm text-gray-500">
                      {isUnlimited ? 'Unlimited' : `${metric.used.toLocaleString()} / ${metric.limit.toLocaleString()}`}
                    </span>
                  </div>
                  {!isUnlimited && (
                    <>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${Math.min(metric.percentage, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-gray-400">{metric.percentage}% used</span>
                        {isExceeded && <span className="text-[10px] text-red-500 font-medium">Hard limit reached — upgrade to continue</span>}
                        {isWarning90 && <span className="text-[10px] text-orange-500 font-medium">Almost at limit — upgrade recommended</span>}
                        {isWarning80 && <span className="text-[10px] text-amber-500 font-medium">Approaching limit</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {usage.periodsRemaining > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {usage.periodsRemaining} day{usage.periodsRemaining !== 1 ? 's' : ''} remaining in current billing period
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
