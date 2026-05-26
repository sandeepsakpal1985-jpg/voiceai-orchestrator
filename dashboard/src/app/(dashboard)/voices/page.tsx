"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Mic2, Check, Volume2, Loader2 } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const voiceOptions = [
  { id: "en-US-Wavenet-D", name: "Emily", language: "en-US", gender: "female", provider: "Google", accent: "American", preview: true, popular: true },
  { id: "en-US-Wavenet-B", name: "Michael", language: "en-US", gender: "male", provider: "Google", accent: "American", preview: true },
  { id: "en-GB-Wavenet-A", name: "Sophie", language: "en-GB", gender: "female", provider: "Google", accent: "British", preview: true },
  { id: "en-GB-Wavenet-B", name: "James", language: "en-GB", gender: "male", provider: "Google", accent: "British", preview: true, popular: true },
  { id: "en-AU-Wavenet-A", name: "Olivia", language: "en-AU", gender: "female", provider: "Google", accent: "Australian", preview: true },
  { id: "es-ES-Wavenet-B", name: "Carlos", language: "es-ES", gender: "male", provider: "Google", accent: "Spanish", preview: true },
  { id: "fr-FR-Wavenet-A", name: "Marie", language: "fr-FR", gender: "female", provider: "Google", accent: "French", preview: true },
  { id: "de-DE-Wavenet-B", name: "Hans", language: "de-DE", gender: "male", provider: "ElevenLabs", accent: "German", preview: true },
];

export default function VoicesPage() {
  const [selectedVoice, setSelectedVoice] = useState(voiceOptions[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    speakingRate: 1.0,
    pitch: 0,
    volumeGainDb: 0,
    emotion: "neutral",
  });

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/voices");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        const vs = data.voiceSettings;
        if (vs) {
          setSelectedVoice(vs.voiceId ?? voiceOptions[0].id);
          setSettings({
            speakingRate: vs.speakingRate ?? 1.0,
            pitch: vs.pitch ?? 0,
            volumeGainDb: vs.volumeGainDb ?? 0,
            emotion: vs.emotion ?? "neutral",
          });
        }
      } catch (err) {
        console.error("Failed to load voice settings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/voices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: selectedVoice,
          speakingRate: settings.speakingRate,
          pitch: settings.pitch,
          volumeGainDb: settings.volumeGainDb,
          emotion: settings.emotion,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Voice settings saved");
    } catch {
      toast.error("Failed to save voice settings");
    } finally {
      setSaving(false);
    }
  };

  const filtered = voiceOptions.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.accent.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.language.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentVoice = voiceOptions.find(v => v.id === selectedVoice);

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
            <Mic2 className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Voice Selection</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose and configure AI voices for your agents</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Input
                  placeholder="Search voices by name, accent, or language..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Mic2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((voice) => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedVoice === voice.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-md"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{voice.name}</p>
                        {voice.popular && <Badge variant="primary" size="sm">Popular</Badge>}
                      </div>
                      <p className="text-sm text-zinc-500">{voice.accent} · {voice.gender}</p>
                    </div>
                    {selectedVoice === voice.id && (
                      <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" size="sm">{voice.language}</Badge>
                      <Badge variant="default" size="sm">{voice.provider}</Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Voice Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {currentVoice && (
                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 mb-2">
                    <p className="text-sm font-medium">{currentVoice.name}</p>
                    <p className="text-xs text-zinc-400">{currentVoice.accent} {currentVoice.gender} · {currentVoice.provider}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Speaking Rate</Label>
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{settings.speakingRate}x</span>
                  </div>
                  <input type="range" min="0.5" max="2.0" step="0.1"
                    value={settings.speakingRate}
                    onChange={(e) => setSettings({ ...settings, speakingRate: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Pitch</Label>
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{settings.pitch}</span>
                  </div>
                  <input type="range" min="-20" max="20" step="1"
                    value={settings.pitch}
                    onChange={(e) => setSettings({ ...settings, pitch: parseInt(e.target.value) })}
                    className="w-full accent-indigo-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Volume Gain</Label>
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{settings.volumeGainDb} dB</span>
                  </div>
                  <input type="range" min="-10" max="10" step="1"
                    value={settings.volumeGainDb}
                    onChange={(e) => setSettings({ ...settings, volumeGainDb: parseInt(e.target.value) })}
                    className="w-full accent-indigo-600" />
                </div>
                <div className="space-y-2">
                  <Label>Emotion</Label>
                  <select className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                    value={settings.emotion}
                    onChange={(e) => setSettings({ ...settings, emotion: e.target.value })}>
                    <option value="neutral">Neutral</option>
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="empathetic">Empathetic</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mx-auto mb-4">
                  <Volume2 className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-sm text-zinc-500 mb-4">Preview the selected voice</p>
                <Button className="w-full" variant="outline">
                  <Play className="h-4 w-4 mr-2" />
                  Play Sample
                </Button>
              </CardContent>
            </Card>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              {saving ? "Saving..." : "Apply Voice"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
