'use client';

import { useState } from 'react';
import { Palette, Globe, Image, Code, Eye, EyeOff, Loader2 } from 'lucide-react';

interface BrandSettings {
  primaryColor: string;
  logo: string | null;
  favicon: string | null;
  customDomain: string | null;
  customCss: string | null;
  hideBranding: boolean;
}

const PRESET_COLORS = [
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Slate', value: '#64748b' },
];

interface BrandEditorProps {
  settings: BrandSettings;
  onChange: (settings: BrandSettings) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

export default function BrandEditor({ settings, onChange, onSave, saving, saved }: BrandEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Palette size={18} className="text-primary" />
        <h2 className="font-semibold text-gray-900">Branding & White-Label</h2>
      </div>

      {/* Primary Color */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Brand Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={settings.primaryColor}
            onChange={(e) => onChange({ ...settings, primaryColor: e.target.value })}
            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
          />
          <input
            type="text"
            value={settings.primaryColor}
            onChange={(e) => onChange({ ...settings, primaryColor: e.target.value })}
            className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => onChange({ ...settings, primaryColor: c.value })}
              className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                settings.primaryColor === c.value ? 'border-gray-800 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Logo URL</label>
        <div className="flex items-center gap-2">
          <Image size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={settings.logo || ''}
            onChange={(e) => onChange({ ...settings, logo: e.target.value || null })}
            placeholder="https://your-site.com/logo.png"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {settings.logo && (
          <div className="mt-2 p-2 bg-gray-50 rounded-lg inline-flex items-center gap-2">
            <img src={settings.logo} alt="Logo preview" className="h-8 w-auto object-contain" onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }} />
            <span className="text-xs text-gray-500">Preview</span>
          </div>
        )}
      </div>

      {/* Favicon */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Favicon URL</label>
        <div className="flex items-center gap-2">
          <Image size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={settings.favicon || ''}
            onChange={(e) => onChange({ ...settings, favicon: e.target.value || null })}
            placeholder="https://your-site.com/favicon.ico"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Custom Domain */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Custom Domain</label>
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={settings.customDomain || ''}
            onChange={(e) => onChange({ ...settings, customDomain: e.target.value || null })}
            placeholder="app.yourbrand.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Point a CNAME record to your deployment domain. Requires DNS configuration.
        </p>
      </div>

      {/* Custom CSS */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <span className="flex items-center gap-2">
            <Code size={16} className="text-gray-400" />
            Custom CSS
          </span>
        </label>
        <textarea
          value={settings.customCss || ''}
          onChange={(e) => onChange({ ...settings, customCss: e.target.value || null })}
          placeholder="/* Add custom styles here */"
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-primary resize-y"
        />
      </div>

      {/* Hide Branding */}
      <div className="mb-4">
        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer">
          <div className="flex items-center gap-2">
            {settings.hideBranding ? <EyeOff size={16} className="text-gray-400" /> : <Eye size={16} className="text-gray-400" />}
            <div>
              <p className="text-sm font-medium text-gray-900">Hide KluConnect Branding</p>
              <p className="text-xs text-gray-500">Remove &apos;Powered by KluConnect&apos; from the dashboard</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.hideBranding}
            onChange={(e) => onChange({ ...settings, hideBranding: e.target.checked })}
            className="rounded text-primary focus:ring-primary"
          />
        </label>
      </div>

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
        style={{ backgroundColor: settings.primaryColor }}
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Palette size={16} />}
        {saved ? 'Saved!' : 'Save Brand Settings'}
      </button>

      {/* Color preview */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs font-medium text-gray-600 flex items-center gap-1"
        >
          {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
        {showPreview && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-white text-xs rounded-lg font-medium"
                style={{ backgroundColor: settings.primaryColor }}>
                Primary Button
              </button>
              <button className="px-3 py-1.5 text-xs rounded-lg font-medium border"
                style={{ borderColor: settings.primaryColor, color: settings.primaryColor }}>
                Outline Button
              </button>
            </div>
            <div className="flex gap-2 items-center text-xs text-gray-500">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: settings.primaryColor }} />
              Brand color applied across dashboard
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
