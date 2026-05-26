"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MicVocal,
  Upload,
  Play,
  Trash2,
  CheckCircle2,
  Loader2,
  Music,
  Mic,
  CircleDot,
  Volume2,
  Plus,
  Wand2,
  FileAudio,
  Settings2,
  Sparkles,
  Globe,
  AudioLines,
  Radio,
  Clock,
  RefreshCw,
  Info,
} from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const ORCHESTRATOR_BASE = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:8000";

interface VoiceProfile {
  id: string;
  name: string;
  provider: string;
  language: string;
  gender: string;
  is_system: boolean;
  description: string;
  speaking_rate: number;
  pitch: number;
  emotion: string;
  has_sample: boolean;
  sample_url: string | null;
  sample_filename: string | null;
  created_at: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  type: "local" | "cloud";
  priority: number;
  supports_cloning: boolean;
  languages: string[];
  description: string;
}

interface EmotionPreset {
  id: string;
  name: string;
  description: string;
}

export default function VoiceCloningPage() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [emotions, setEmotions] = useState<EmotionPreset[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<VoiceProfile | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState("openvoice");
  const [formLanguage, setFormLanguage] = useState("en");
  const [formGender, setFormGender] = useState("female");
  const [formDescription, setFormDescription] = useState("");
  const [formSpeakingRate, setFormSpeakingRate] = useState(1.0);
  const [formPitch, setFormPitch] = useState(0);
  const [formEmotion, setFormEmotion] = useState("neutral");
  const [formSample, setFormSample] = useState<File | null>(null);
  const [formSampleName, setFormSampleName] = useState("");

  // Preview
  const [previewText, setPreviewText] = useState("Hello, this is a preview of my custom voice. How can I help you today?");
  const [previewProfileId, setPreviewProfileId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Clone test
  const [testProfileId, setTestProfileId] = useState<string>("");
  const [testText, setTestText] = useState("This voice was cloned from my audio sample. It sounds natural and professional.");
  const [cloning, setCloning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data
  const fetchData = async () => {
    try {
      const [profilesRes, providersRes, emotionsRes] = await Promise.all([
        fetch(`${ORCHESTRATOR_BASE}/voice-profiles`),
        fetch(`${ORCHESTRATOR_BASE}/voice-profiles/presets/providers`),
        fetch(`${ORCHESTRATOR_BASE}/voice-profiles/presets/emotions`),
      ]);

      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setProfiles(data.profiles ?? []);
      }
      if (providersRes.ok) {
        const data = await providersRes.json();
        setProviders(data.providers ?? []);
      }
      if (emotionsRes.ok) {
        const data = await emotionsRes.json();
        setEmotions(data.presets ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch voice cloning data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Create profile
  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);

    try {
      const body = new FormData();
      body.append("name", formName);
      body.append("provider", formProvider);
      body.append("language", formLanguage);
      body.append("gender", formGender);
      body.append("description", formDescription);
      body.append("speaking_rate", String(formSpeakingRate));
      body.append("pitch", String(formPitch));
      body.append("emotion", formEmotion);
      if (formSample) {
        body.append("sample", formSample);
      }

      const res = await fetch(`${ORCHESTRATOR_BASE}/voice-profiles`, {
        method: "POST",
        body,
      });

      if (res.ok) {
        setShowCreateDialog(false);
        resetForm();
        await fetchData();
      } else {
        const err = await res.json();
        console.error("Failed to create profile:", err.detail ?? err);
      }
    } catch (err) {
      console.error("Failed to create profile", err);
    } finally {
      setSaving(false);
    }
  };

  // Update profile
  const handleUpdate = async () => {
    if (!editingProfile) return;
    setSaving(true);

    try {
      const body = new FormData();
      body.append("name", formName);
      body.append("provider", formProvider);
      body.append("language", formLanguage);
      body.append("gender", formGender);
      body.append("description", formDescription);
      body.append("speaking_rate", String(formSpeakingRate));
      body.append("pitch", String(formPitch));
      body.append("emotion", formEmotion);
      if (formSample) {
        body.append("sample", formSample);
      }

      const res = await fetch(`${ORCHESTRATOR_BASE}/voice-profiles/${editingProfile.id}`, {
        method: "PUT",
        body,
      });

      if (res.ok) {
        setEditingProfile(null);
        resetForm();
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to update profile", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete profile
  const handleDelete = async (profileId: string) => {
    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/voice-profiles/${profileId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Failed to delete profile", err);
    }
  };

  // Open edit dialog
  const openEdit = (profile: VoiceProfile) => {
    setEditingProfile(profile);
    setFormName(profile.name);
    setFormProvider(profile.provider);
    setFormLanguage(profile.language);
    setFormGender(profile.gender);
    setFormDescription(profile.description);
    setFormSpeakingRate(profile.speaking_rate);
    setFormPitch(profile.pitch);
    setFormEmotion(profile.emotion);
    setFormSample(null);
    setFormSampleName("");
  };

  // Reset form
  const resetForm = () => {
    setFormName("");
    setFormProvider("openvoice");
    setFormLanguage("en");
    setFormGender("female");
    setFormDescription("");
    setFormSpeakingRate(1.0);
    setFormPitch(0);
    setFormEmotion("neutral");
    setFormSample(null);
    setFormSampleName("");
  };

  // Preview voice
  const handlePreview = async (profileId: string) => {
    if (!previewText.trim()) return;
    setPreviewProfileId(profileId);
    setPreviewLoading(true);

    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/voice/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: previewText,
          voice_id: profileId,
          language: profiles.find((p) => p.id === profileId)?.language ?? "en",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const blob = new Blob(
          [Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/wav" }
        );
        setAudioUrl(URL.createObjectURL(blob));
        setTimeout(() => audioRef.current?.play(), 100);
      }
    } catch (err) {
      console.error("Preview failed", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Clone voice test
  const handleCloneTest = async () => {
    if (!testProfileId || !testText.trim()) return;
    setCloning(true);

    try {
      const res = await fetch(`${ORCHESTRATOR_BASE}/voice-profiles/${testProfileId}`);
      if (!res.ok) return;
      const { profile } = await res.json();

      const synthRes = await fetch(`${ORCHESTRATOR_BASE}/voice/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: testText,
          voice_id: testProfileId,
          language: profile.language ?? "en",
        }),
      });

      if (synthRes.ok) {
        const data = await synthRes.json();
        const blob = new Blob(
          [Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0))],
          { type: "audio/wav" }
        );
        setAudioUrl(URL.createObjectURL(blob));
        setTimeout(() => audioRef.current?.play(), 100);
      }
    } catch (err) {
      console.error("Clone test failed", err);
    } finally {
      setCloning(false);
    }
  };

  // Get provider display name
  const getProviderName = (providerId: string) => {
    const p = providers.find((p) => p.id === providerId);
    return p?.name ?? providerId;
  };

  const getProviderBadge = (providerId: string) => {
    const p = providers.find((p) => p.id === providerId);
    if (!p) return null;
    return (
      <Badge variant={p.type === "local" ? "default" : "secondary"} className="text-[10px]">
        {p.type === "local" ? "Local" : "Cloud"}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const userProfiles = profiles.filter((p) => !p.is_system);
  const systemProfiles = profiles.filter((p) => p.is_system);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <MicVocal className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Voice Cloning</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Create, manage, and test custom voice profiles for your AI agents
              </p>
            </div>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Voice Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{editingProfile ? "Edit Voice Profile" : "Create Voice Profile"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Profile Name</label>
                  <Input
                    placeholder="e.g., My Custom Voice"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                {/* Provider + Language */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">TTS Provider</label>
                    <Select value={formProvider} onValueChange={setFormProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <Select value={formLanguage} onValueChange={setFormLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                        <SelectItem value="ko">Korean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Gender + Emotion */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Gender</label>
                    <Select value={formGender} onValueChange={setFormGender}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="neutral">Neutral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default Emotion</label>
                    <Select value={formEmotion} onValueChange={setFormEmotion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {emotions.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Speaking Rate + Pitch */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Speaking Rate</label>
                      <span className="text-xs text-zinc-500">{formSpeakingRate.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={formSpeakingRate}
                      onChange={(e) => setFormSpeakingRate(parseFloat(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Pitch</label>
                      <span className="text-xs text-zinc-500">{formPitch > 0 ? `+${formPitch}` : formPitch}</span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="1"
                      value={formPitch}
                      onChange={(e) => setFormPitch(parseInt(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    placeholder="Brief description of this voice profile..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="min-h-[60px] resize-none"
                  />
                </div>

                {/* Audio Sample Upload */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Speaker Sample (for voice cloning)</label>
                  <div
                    className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {formSample ? (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <FileAudio className="h-4 w-4 text-indigo-500" />
                        <span className="text-zinc-700 dark:text-zinc-300">{formSample.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {(formSample.size / 1024).toFixed(0)} KB
                        </Badge>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                        <p>Click to upload an audio sample (WAV, MP3, max 10MB)</p>
                        <p className="text-xs text-zinc-400 mt-1">At least 10 seconds of clear speech recommended</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".wav,.mp3,.m4a,.ogg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormSample(file);
                        setFormSampleName(file.name);
                      }
                    }}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateDialog(false);
                      setEditingProfile(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={editingProfile ? handleUpdate : handleCreate}
                    disabled={saving || !formName.trim()}
                    className="gap-2"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {saving ? "Saving..." : editingProfile ? "Update Profile" : "Create Profile"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">System Voices</p>
                <Mic className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="text-2xl font-bold mt-1">{systemProfiles.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">Custom Voices</p>
                <MicVocal className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold mt-1">{userProfiles.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">With Samples</p>
                <FileAudio className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold mt-1">
                {userProfiles.filter((p) => p.has_sample).length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Cloning Ready</p>
                <Wand2 className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-1">
                {userProfiles.filter((p) => p.has_sample && p.provider !== "kokoro").length} profiles
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="custom">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="custom" className="gap-2">
              <MicVocal className="h-4 w-4" /> Custom Voices
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-2">
              <Music className="h-4 w-4" /> System Voices
            </TabsTrigger>
            <TabsTrigger value="clone-test" className="gap-2">
              <Wand2 className="h-4 w-4" /> Test Cloning
            </TabsTrigger>
            <TabsTrigger value="providers" className="gap-2">
              <Settings2 className="h-4 w-4" /> Providers
            </TabsTrigger>
          </TabsList>

          {/* Custom Voices Tab */}
          <TabsContent value="custom" className="space-y-4 pt-4">
            {userProfiles.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4">
                    <MicVocal className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">No custom voices yet</h3>
                  <p className="text-sm text-zinc-500 mb-4 max-w-md">
                    Create your first voice profile to clone a voice from an audio sample. Your custom voices can be used by any AI agent.
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Voice Profile
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {userProfiles.map((profile) => (
                  <Card key={profile.id} className="hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center">
                            <MicVocal className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{profile.name}</CardTitle>
                            <CardDescription className="text-xs">
                              {getProviderName(profile.provider)} · {profile.language.toUpperCase()} · {profile.gender}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(profile)}
                            title="Edit"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-red-600"
                            onClick={() => handleDelete(profile.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-zinc-500 mb-3 line-clamp-2">
                        {profile.description || "No description"}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {getProviderBadge(profile.provider)}
                        <Badge variant="outline" className="text-[10px]">
                          {profile.emotion}
                        </Badge>
                        {profile.has_sample && (
                          <Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <FileAudio className="h-3 w-3 mr-1" />
                            Sample
                          </Badge>
                        )}
                        {!profile.has_sample && profile.provider !== "kokoro" && (
                          <Badge variant="secondary" className="text-[10px]">
                            No sample
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            setPreviewProfileId(profile.id);
                            handlePreview(profile.id);
                          }}
                          disabled={previewLoading && previewProfileId === profile.id}
                        >
                          {previewLoading && previewProfileId === profile.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          Preview
                        </Button>
                        <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                          <AudioLines className="h-3 w-3" />
                          {profile.speaking_rate}x
                          {profile.pitch !== 0 && (
                            <> · {profile.pitch > 0 ? "+" : ""}{profile.pitch}</>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* System Voices Tab */}
          <TabsContent value="system" className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-3">
              {systemProfiles.map((profile) => (
                <Card key={profile.id} className="bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950 border-zinc-200 dark:border-zinc-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                        <Music className="h-5 w-5 text-zinc-500" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{profile.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {getProviderName(profile.provider)} · System Voice
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-zinc-500 mb-3">{profile.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{profile.language.toUpperCase()}</Badge>
                      <Badge variant="outline" className="text-[10px]">{profile.gender}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Test Cloning Tab */}
          <TabsContent value="clone-test" className="space-y-4 pt-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wand2 className="h-4 w-4 text-indigo-500" />
                    Test Voice Cloning
                  </CardTitle>
                  <CardDescription>
                    Select a custom voice profile with a speaker sample to test voice cloning
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Voice</label>
                    <Select
                      value={testProfileId}
                      onValueChange={setTestProfileId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a cloned voice..." />
                      </SelectTrigger>
                      <SelectContent>
                        {userProfiles
                          .filter((p) => p.has_sample || p.provider === "kokoro")
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({getProviderName(p.provider)})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Test Text</label>
                    <Textarea
                      value={testText}
                      onChange={(e) => setTestText(e.target.value)}
                      className="min-h-[100px] resize-none"
                      placeholder="Enter text to synthesize with the cloned voice..."
                    />
                  </div>
                  <Button
                    onClick={handleCloneTest}
                    disabled={cloning || !testProfileId || !testText.trim()}
                    className="w-full gap-2"
                  >
                    {cloning ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Synthesizing...</>
                    ) : (
                      <><Wand2 className="h-4 w-4" /> Synthesize with Cloned Voice</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Volume2 className="h-4 w-4 text-indigo-500" />
                    Preview & Compare
                  </CardTitle>
                  <CardDescription>
                    Preview text with any voice profile
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Preview Text</label>
                    <Textarea
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      className="min-h-[80px] resize-none"
                      placeholder="Enter text to preview..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Voice</label>
                    <Select
                      value={previewProfileId ?? ""}
                      onValueChange={(v) => setPreviewProfileId(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a voice to preview..." />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.is_system ? "System" : "Custom"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => previewProfileId && handlePreview(previewProfileId)}
                    disabled={previewLoading || !previewProfileId || !previewText.trim()}
                    className="w-full gap-2"
                  >
                    {previewLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                    ) : (
                      <><Play className="h-4 w-4" /> Preview</>
                    )}
                  </Button>

                  {/* Audio Player */}
                  {audioUrl && (
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                      <audio ref={audioRef} src={audioUrl} controls className="w-full" />
                      <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
                        <span><Clock className="h-3 w-3 inline mr-1" /> Click play to hear</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setAudioUrl(null)}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Providers Tab */}
          <TabsContent value="providers" className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {providers.map((provider) => (
                <Card key={provider.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          provider.type === "local"
                            ? "bg-emerald-100 dark:bg-emerald-900/30"
                            : "bg-blue-100 dark:bg-blue-900/30"
                        }`}>
                          {provider.supports_cloning ? (
                            <Wand2 className={`h-5 w-5 ${
                              provider.type === "local" ? "text-emerald-600" : "text-blue-600"
                            }`} />
                          ) : (
                            <Mic className={`h-5 w-5 ${
                              provider.type === "local" ? "text-emerald-600" : "text-blue-600"
                            }`} />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-sm">{provider.name}</CardTitle>
                          <CardDescription className="text-xs">
                            Priority {provider.priority}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={provider.type === "local" ? "default" : "secondary"} className="text-[10px]">
                        {provider.type === "local" ? "Local" : "Cloud"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-zinc-500">{provider.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {provider.supports_cloning && (
                        <Badge variant="outline" className="text-[10px] gap-1 border-indigo-200 dark:border-indigo-800">
                          <Wand2 className="h-3 w-3 text-indigo-500" /> Voice Cloning
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Globe className="h-3 w-3" /> {provider.languages.length} languages
                      </Badge>
                    </div>
                    {provider.languages.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {provider.languages.slice(0, 8).map((lang) => (
                          <span key={lang} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            {lang.toUpperCase()}
                          </span>
                        ))}
                        {provider.languages.length > 8 && (
                          <span className="text-[10px] text-zinc-400">+{provider.languages.length - 8} more</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingProfile} onOpenChange={(open) => { if (!open) { setEditingProfile(null); resetForm(); }}}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Voice Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Profile Name</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">TTS Provider</label>
                <Select value={formProvider} onValueChange={setFormProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Language</label>
                <Select value={formLanguage} onValueChange={setFormLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Speaking Rate</label>
                <span className="text-xs text-zinc-500">{formSpeakingRate.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.1"
                value={formSpeakingRate}
                onChange={(e) => setFormSpeakingRate(parseFloat(e.target.value))}
                className="w-full accent-indigo-600" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
                className="min-h-[60px] resize-none" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setEditingProfile(null); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={saving || !formName.trim()} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
