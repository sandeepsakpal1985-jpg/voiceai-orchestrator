"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Globe, Check, Plus, Languages, ArrowRight, Loader2 } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const availableLanguages = [
  { code: "en-US", name: "English (US)", native: "English", supported: true },
  { code: "es-ES", name: "Spanish", native: "Español", supported: true },
  { code: "fr-FR", name: "French", native: "Français", supported: true },
  { code: "de-DE", name: "German", native: "Deutsch", supported: true },
  { code: "it-IT", name: "Italian", native: "Italiano", supported: true },
  { code: "pt-BR", name: "Portuguese (BR)", native: "Português", supported: true },
  { code: "ja-JP", name: "Japanese", native: "日本語", supported: false },
  { code: "ko-KR", name: "Korean", native: "한국어", supported: false },
  { code: "zh-CN", name: "Chinese (Simplified)", native: "简体中文", supported: false },
  { code: "ar-SA", name: "Arabic", native: "العربية", supported: false },
  { code: "nl-NL", name: "Dutch", native: "Nederlands", supported: false },
  { code: "sv-SE", name: "Swedish", native: "Svenska", supported: false },
];

export default function MultilingualPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabledLanguages, setEnabledLanguages] = useState(["en-US", "es-ES", "fr-FR"]);
  const [autoDetect, setAutoDetect] = useState(true);
  const [defaultLanguage, setDefaultLanguage] = useState("en-US");
  const [translationProvider, setTranslationProvider] = useState("google");

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/multilingual");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        const config = data.config;
        if (config) {
          setEnabledLanguages(config.supportedLanguages ?? ["en-US", "es-ES", "fr-FR"]);
          setAutoDetect(config.autoDetect ?? true);
          setDefaultLanguage(config.defaultLanguage ?? "en-US");
          setTranslationProvider(config.translationProvider ?? "google");
        }
      } catch (err) {
        console.error("Failed to load multilingual config:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/multilingual", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultLanguage,
          fallbackLanguage: "en-US",
          autoDetect,
          supportedLanguages: enabledLanguages,
          translationProvider,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Multilingual configuration saved");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = (code: string) => {
    setEnabledLanguages(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 col-span-2" />
            <Skeleton className="h-96 col-span-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Multilingual Configuration</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure language support for your voice agents</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Language Detection</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">Auto-detect Language</p>
                    <p className="text-sm text-zinc-500">Automatically detect and route calls to the appropriate language agent</p>
                  </div>
                  <Switch checked={autoDetect} onCheckedChange={setAutoDetect} />
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                  <Languages className="h-5 w-5 text-indigo-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Default Language</p>
                    <select className="mt-1 h-8 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
                      value={defaultLanguage}
                      onChange={(e) => setDefaultLanguage(e.target.value)}>
                      {availableLanguages.filter(l => l.supported).map(l => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Enabled Languages</CardTitle>
                  <Badge variant="primary">{enabledLanguages.length} active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {enabledLanguages.length === 0 ? (
                  <p className="text-sm text-zinc-400 text-center py-4">No languages enabled. Select from available languages below.</p>
                ) : (
                <div className="space-y-2">
                  {availableLanguages.filter(l => enabledLanguages.includes(l.code)).map((lang) => (
                    <div key={lang.code} className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-600">
                          {lang.native[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{lang.name}</p>
                          <p className="text-xs text-zinc-400">{lang.native} · {lang.code}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => toggleLanguage(lang.code)} className="text-red-500 hover:text-red-700">Remove</Button>
                    </div>
                  ))}
                </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Available Languages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableLanguages.map((lang) => {
                    const isEnabled = enabledLanguages.includes(lang.code);
                    return (
                      <div
                        key={lang.code}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                          isEnabled
                            ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30"
                            : lang.supported
                            ? "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                            : "border-zinc-100 dark:border-zinc-800 opacity-50"
                        }`}
                        onClick={() => lang.supported && toggleLanguage(lang.code)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{lang.native[0]}</span>
                          <div>
                            <p className="text-sm font-medium">{lang.name}</p>
                            <p className="text-xs text-zinc-400">{lang.code}</p>
                          </div>
                        </div>
                        {isEnabled ? (
                          <div className="h-5 w-5 rounded bg-indigo-600 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        ) : !lang.supported ? (
                          <Badge variant="warning" size="sm">Coming soon</Badge>
                        ) : (
                          <Plus className="h-5 w-5 text-zinc-300" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Translation Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <select className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                    value={translationProvider}
                    onChange={(e) => setTranslationProvider(e.target.value)}>
                    <option value="google">Google Cloud Translation</option>
                    <option value="deepl">DeepL</option>
                    <option value="amazon">Amazon Translate</option>
                    <option value="azure">Azure Translator</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <input type="password" className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm" placeholder="Enter API key" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Language Routing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-zinc-500">Configure how calls are routed based on detected language.</p>
                {enabledLanguages.slice(0, 5).map((code) => {
                  const lang = availableLanguages.find(l => l.code === code);
                  return (
                    <div key={code} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <Badge variant="primary" size="sm">{code}</Badge>
                      <ArrowRight className="h-3 w-3 text-zinc-400" />
                      <Badge size="sm">{lang?.name ?? code} Agent</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
