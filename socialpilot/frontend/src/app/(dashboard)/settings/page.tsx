'use client';

'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Save, Loader2, Bell, Shield, Palette, Smartphone, Key, Webhook } from 'lucide-react';
import BrandEditor from '@/components/BrandEditor';
import ApiKeyManager from '@/components/ApiKeyManager';
import WebhookManager from '@/components/WebhookManager';

interface SettingsState {
  businessName: string;
  website: string;
  industry: string;
  automationEnabled: boolean;
  approvalMode: boolean;
  timezone: string;
  defaultPersonality: string;
  // Brand fields
  primaryColor: string;
  logo: string | null;
  favicon: string | null;
  customDomain: string | null;
  customCss: string | null;
  hideBranding: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    businessName: '',
    website: '',
    industry: '',
    automationEnabled: true,
    approvalMode: false,
    timezone: 'UTC',
    defaultPersonality: 'friendly',
    primaryColor: '#6366f1',
    logo: null,
    favicon: null,
    customDomain: null,
    customCss: null,
    hideBranding: false,
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/settings'),
      api.get('/api/auth/me'),
    ]).then(([settingsRes, meRes]: [any, any]) => {
      if (settingsRes.success && settingsRes.data) {
        setSettings({
          businessName: settingsRes.data.businessName || '',
          website: settingsRes.data.website || '',
          industry: settingsRes.data.industry || '',
          automationEnabled: settingsRes.data.automationEnabled ?? true,
          approvalMode: settingsRes.data.approvalMode ?? false,
          timezone: settingsRes.data.timezone || 'UTC',
          defaultPersonality: settingsRes.data.defaultPersonality || 'friendly',
          primaryColor: settingsRes.data.primaryColor || '#6366f1',
          logo: settingsRes.data.logo || null,
          favicon: settingsRes.data.favicon || null,
          customDomain: settingsRes.data.customDomain || null,
          customCss: settingsRes.data.customCss || null,
          hideBranding: settingsRes.data.hideBranding ?? false,
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await api.put('/api/settings', settings);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure your AI sales agent</p>
      </div>

      {/* Brand Information */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} className="text-primary" />
          <h2 className="font-semibold text-gray-900">Brand Information</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
              <input
                value={settings.businessName}
                onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <input
                value={settings.industry}
                onChange={(e) => setSettings({ ...settings, industry: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input
              value={settings.website}
              onChange={(e) => setSettings({ ...settings, website: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>
      </div>

      {/* Brand Editor (White-Label) */}
      <BrandEditor
        settings={{
          primaryColor: settings.primaryColor,
          logo: settings.logo,
          favicon: settings.favicon,
          customDomain: settings.customDomain,
          customCss: settings.customCss,
          hideBranding: settings.hideBranding,
        }}
        onChange={(brand) => setSettings({ ...settings, ...brand })}
        onSave={handleSave}
        saving={saving}
        saved={saved}
      />

      {/* AI Personality */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone size={18} className="text-primary" />
          <h2 className="font-semibold text-gray-900">AI Personality</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { id: 'friendly', label: 'Friendly', desc: 'Warm and approachable' },
            { id: 'premium', label: 'Premium', desc: 'Polished and professional' },
            { id: 'luxury', label: 'Luxury', desc: 'Elegant and refined' },
            { id: 'customer_support', label: 'Support', desc: 'Patient and helpful' },
            { id: 'sales_closer', label: 'Sales Closer', desc: 'Persuasive and confident' },
          ].map((personality) => (
            <button
              key={personality.id}
              onClick={() => setSettings({ ...settings, defaultPersonality: personality.id })}
              className={`p-3 rounded-lg border text-left transition-all ${
                settings.defaultPersonality === personality.id
                  ? 'border-primary bg-primary-50 ring-1 ring-primary'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">{personality.label}</p>
              <p className="text-xs text-gray-500 mt-1">{personality.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Automation */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-primary" />
          <h2 className="font-semibold text-gray-900">Automation</h2>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">AI Automation</p>
              <p className="text-xs text-gray-500">Let AI automatically respond to comments and DMs</p>
            </div>
            <input
              type="checkbox"
              checked={settings.automationEnabled}
              onChange={(e) => setSettings({ ...settings, automationEnabled: e.target.checked })}
              className="rounded text-primary focus:ring-primary"
            />
          </label>
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">Approval Mode</p>
              <p className="text-xs text-gray-500">AI drafts responses, you approve before sending</p>
            </div>
            <input
              type="checkbox"
              checked={settings.approvalMode}
              onChange={(e) => setSettings({ ...settings, approvalMode: e.target.checked })}
              className="rounded text-primary focus:ring-primary"
            />
          </label>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saved ? 'Saved!' : 'Save Settings'}
      </button>

      <ApiKeyManager />
      <WebhookManager />
    </div>
  );
}
