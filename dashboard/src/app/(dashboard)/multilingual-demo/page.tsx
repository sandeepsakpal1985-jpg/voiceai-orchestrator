"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/dashboard/navbar";
import {
  Globe,
  Play,
  StopCircle,
  Volume2,
  Mic,
  RefreshCw,
  CheckCircle2,
  Languages,
  ArrowRight,
  Loader2,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Supported Languages ──────────────────────────────────────────

interface Language {
  code: string;
  name: string;
  native: string;
  flag: string;
  voice: string;
  sttModel: string;
  ttsModel: string;
  samples: string[];
}

const languages: Language[] = [
  {
    code: "en",
    name: "English",
    native: "English",
    flag: "🇺🇸",
    voice: "en-US-Wavenet-D",
    sttModel: "Whisper / Deepgram",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "Hello! Welcome to VoiceAI. How can I help you today?",
      "Our AI voice platform supports real-time conversations in over 30 languages.",
      "You can deploy agents that speak naturally with your customers worldwide.",
    ],
  },
  {
    code: "hi",
    name: "Hindi",
    native: "हिन्दी",
    flag: "🇮🇳",
    voice: "hi-IN-Wavenet-A",
    sttModel: "Whisper / Deepgram",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "नमस्ते! वॉइसएआई में आपका स्वागत है। मैं आपकी कैसे सहायता कर सकता हूँ?",
      "हमारा AI वॉइस प्लेटफ़ॉर्म 30 से अधिक भाषाओं में रीयल-टाइम बातचीत का समर्थन करता है।",
      "आप ऐसे एजेंट तैनात कर सकते हैं जो आपके ग्राहकों से दुनिया भर में स्वाभाविक रूप से बात करते हैं।",
    ],
  },
  {
    code: "es",
    name: "Spanish",
    native: "Español",
    flag: "🇪🇸",
    voice: "es-ES-Wavenet-B",
    sttModel: "Whisper / Deepgram",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "¡Hola! Bienvenido a VoiceAI. ¿Cómo puedo ayudarte hoy?",
      "Nuestra plataforma de voz con IA admite conversaciones en tiempo real en más de 30 idiomas.",
      "Puedes implementar agentes que hablen naturalmente con tus clientes en todo el mundo.",
    ],
  },
  {
    code: "fr",
    name: "French",
    native: "Français",
    flag: "🇫🇷",
    voice: "fr-FR-Wavenet-C",
    sttModel: "Whisper / Deepgram",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "Bonjour ! Bienvenue chez VoiceAI. Comment puis-je vous aider aujourd'hui ?",
      "Notre plateforme vocale IA prend en charge les conversations en temps réel dans plus de 30 langues.",
      "Vous pouvez déployer des agents qui parlent naturellement avec vos clients dans le monde entier.",
    ],
  },
  {
    code: "de",
    name: "German",
    native: "Deutsch",
    flag: "🇩🇪",
    voice: "de-DE-Wavenet-A",
    sttModel: "Whisper / Deepgram",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "Hallo! Willkommen bei VoiceAI. Wie kann ich Ihnen heute helfen?",
      "Unsere KI-Sprachplattform unterstützt Echtzeit-Gespräche in über 30 Sprachen.",
      "Sie können Agenten einsetzen, die natürlich mit Ihren Kunden weltweit sprechen.",
    ],
  },
  {
    code: "ja",
    name: "Japanese",
    native: "日本語",
    flag: "🇯🇵",
    voice: "ja-JP-Wavenet-C",
    sttModel: "Whisper",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "こんにちは！VoiceAIへようこそ。本日はどのようなご用件でしょうか？",
      "当社のAI音声プラットフォームは、30以上の言語でのリアルタイム会話をサポートしています。",
      "世界中のお客様と自然に会話できるエージェントを展開できます。",
    ],
  },
  {
    code: "zh",
    name: "Chinese",
    native: "中文",
    flag: "🇨🇳",
    voice: "zh-CN-Wavenet-A",
    sttModel: "Whisper",
    ttsModel: "Kokoro / ElevenLabs",
    samples: [
      "你好！欢迎来到VoiceAI。今天我能为您做些什么？",
      "我们的AI语音平台支持超过30种语言的实时对话。",
      "您可以部署能够自然地与全球客户交谈的智能代理。",
    ],
  },
  {
    code: "ar",
    name: "Arabic",
    native: "العربية",
    flag: "🇦🇪",
    voice: "ar-XA-Wavenet-A",
    sttModel: "Whisper / Deepgram",
    ttsModel: "ElevenLabs",
    samples: [
      "مرحباً! أهلاً بك في VoiceAI. كيف يمكنني مساعدتك اليوم؟",
      "منصتنا الصوتية بالذكاء الاصطناعي تدعم المحادثات الفورية بأكثر من 30 لغة.",
      "يمكنك نشر وكلاء يتحدثون بشكل طبيعي مع عملائك في جميع أنحاء العالم.",
    ],
  },
];

// ── Demo Scenarios ───────────────────────────────────────────────

interface Scenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompts: {
    user: string;
    agent: string;
  }[];
}

const scenarios: Scenario[] = [
  {
    id: "customer-support",
    name: "Customer Support",
    description: "A customer calling for help with a product issue",
    icon: "🎧",
    prompts: [
      {
        user: "I can't log into my account",
        agent: "I understand you're having trouble logging in. Let me help you reset your password. Could you please provide your registered email address?",
      },
      {
        user: "My email is john@example.com",
        agent: "Thank you! I've sent a password reset link to john@example.com. Please check your inbox and follow the instructions. Is there anything else I can help with?",
      },
    ],
  },
  {
    id: "sales-inquiry",
    name: "Sales Inquiry",
    description: "A prospect asking about pricing and features",
    icon: "💼",
    prompts: [
      {
        user: "What are your pricing plans?",
        agent: "We offer three plans: Starter at $29/month for up to 1,000 calls, Professional at $99/month for up to 10,000 calls, and Enterprise with custom pricing. Which one fits your needs?",
      },
      {
        user: "Tell me about the Enterprise plan",
        agent: "Enterprise includes unlimited calls, dedicated support, custom integrations, on-premise deployment option, and advanced analytics. Would you like to schedule a demo with our sales team?",
      },
    ],
  },
  {
    id: "appointment",
    name: "Appointment Booking",
    description: "Scheduling a meeting or service appointment",
    icon: "📅",
    prompts: [
      {
        user: "I need to book a service appointment",
        agent: "I'd be happy to help you schedule a service appointment. We have availability this Wednesday at 2 PM or Friday at 10 AM. Which works better for you?",
      },
      {
        user: "Friday at 10 AM works",
        agent: "Perfect! I've booked your appointment for Friday at 10 AM. You'll receive a confirmation email shortly. Would you like me to add a reminder for 30 minutes before?",
      },
    ],
  },
];

// ── Components ───────────────────────────────────────────────────

function LanguageCard({
  lang,
  isSelected,
  onSelect,
  onPlay,
  isPlaying,
}: {
  lang: Language;
  isSelected: boolean;
  onSelect: () => void;
  onPlay: (text: string) => void;
  isPlaying: boolean;
}) {
  const [currentSample, setCurrentSample] = useState(0);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md",
        isSelected
          ? "ring-2 ring-indigo-500 border-indigo-500 dark:ring-indigo-400"
          : "hover:border-zinc-300 dark:hover:border-zinc-600"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{lang.flag}</span>
            <div>
              <CardTitle className="text-base">{lang.name}</CardTitle>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {lang.native}
              </p>
            </div>
          </div>
          {isSelected && (
            <Badge variant="info" size="sm">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center justify-between">
            <span>STT</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {lang.sttModel}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>TTS</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {lang.ttsModel}
            </span>
          </div>
        </div>

        {/* Sample Playback */}
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Sample
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed min-h-[2.5rem]">
            {lang.samples[currentSample]}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(lang.samples[currentSample]);
              }}
              aria-label={isPlaying ? "Stop" : "Play sample"}
            >
              {isPlaying ? (
                <StopCircle className="h-4 w-4 text-red-500" />
              ) : (
                <Play className="h-4 w-4 text-indigo-500" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-zinc-400 hover:text-zinc-600"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentSample((prev) => (prev + 1) % lang.samples.length);
              }}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioCard({
  scenario,
  selectedLang,
}: {
  scenario: Scenario;
  selectedLang: Language;
}) {
  const [step, setStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [showAgent, setShowAgent] = useState(false);

  const startDemo = useCallback(() => {
    setIsActive(true);
    setStep(0);
    setShowAgent(false);
  }, []);

  const nextStep = useCallback(() => {
    if (step < scenario.prompts.length - 1) {
      setShowAgent(false);
      setTimeout(() => {
        setStep((prev) => prev + 1);
        setShowAgent(true);
      }, 500);
    }
  }, [step, scenario.prompts.length]);

  const reset = useCallback(() => {
    setIsActive(false);
    setStep(0);
    setShowAgent(false);
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{scenario.icon}</span>
            <div>
              <CardTitle className="text-base">{scenario.name}</CardTitle>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {scenario.description}
              </p>
            </div>
          </div>
          {!isActive ? (
            <Button size="sm" onClick={startDemo} className="shrink-0">
              <Play className="h-4 w-4 mr-2" />
              Start Demo
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={reset} className="shrink-0">
              <StopCircle className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      {isActive && (
        <CardContent className="space-y-4">
          {/* User Message */}
          <div className="flex gap-3 justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 bg-indigo-600 text-white text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-indigo-200">
                  You ({selectedLang.native})
                </span>
              </div>
              <p>{scenario.prompts[step].user}</p>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
              <Mic className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
            </div>
          </div>

          {/* Agent Response */}
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
              <Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            </div>
            {showAgent ? (
              <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-sm animate-in fade-in slide-in-from-left-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="success" size="sm" className="gap-1">
                    <Volume2 className="h-3 w-3 animate-pulse" />
                    Speaking {selectedLang.name}
                  </Badge>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    AI Agent
                  </span>
                </div>
                <p>{scenario.prompts[step].agent}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing response...
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {step < scenario.prompts.length - 1 && showAgent && (
              <Button size="sm" onClick={nextStep} variant="outline">
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
            {step >= scenario.prompts.length - 1 && showAgent && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  Demo Complete
                </span>
                <Button size="sm" variant="outline" onClick={reset} className="ml-2">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Replay
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function MultilingualDemoPage() {
  const [selectedLang, setSelectedLang] = useState<Language>(languages[0]);
  const [playingText, setPlayingText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("languages");
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handlePlaySample = useCallback(
    (text: string) => {
      if (playingText === text) {
        window.speechSynthesis.cancel();
        setPlayingText(null);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLang.code === "zh"
        ? "zh-CN"
        : selectedLang.code === "ar"
        ? "ar-SA"
        : selectedLang.code === "hi"
        ? "hi-IN"
        : `${selectedLang.code}`;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.onstart = () => setPlayingText(text);
      utterance.onend = () => setPlayingText(null);
      utterance.onerror = () => setPlayingText(null);
      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [playingText, selectedLang.code]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Multilingual Demo
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Experience VoiceAI in 8 languages — try STT, TTS, and interactive conversations
              </p>
            </div>
          </div>
          <Badge variant="info" className="gap-1.5">
            <Languages className="h-3.5 w-3.5" />
            {languages.length} Languages Supported
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="languages">
              <Globe className="h-4 w-4 mr-2" />
              Languages
            </TabsTrigger>
            <TabsTrigger value="demo">
              <Play className="h-4 w-4 mr-2" />
              Interactive Demo
            </TabsTrigger>
            <TabsTrigger value="info">
              <Volume2 className="h-4 w-4 mr-2" />
              How It Works
            </TabsTrigger>
          </TabsList>

          {/* ── Languages Tab ── */}
          <TabsContent value="languages" className="space-y-6">
            {/* Active Language Banner */}
            <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 border-0">
              <CardContent className="py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">{selectedLang.flag}</span>
                    <div className="text-white">
                      <h2 className="text-xl font-bold">
                        {selectedLang.native} ({selectedLang.name})
                      </h2>
                      <p className="text-emerald-100 text-sm mt-1">
                        STT: {selectedLang.sttModel} · TTS: {selectedLang.ttsModel}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/20 text-white hover:bg-white/30 border-0"
                    onClick={() => setActiveTab("demo")}
                  >
                    Try Demo
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Language Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {languages.map((lang) => (
                <LanguageCard
                  key={lang.code}
                  lang={lang}
                  isSelected={selectedLang.code === lang.code}
                  onSelect={() => setSelectedLang(lang)}
                  onPlay={handlePlaySample}
                  isPlaying={playingText !== null}
                />
              ))}
            </div>
          </TabsContent>

          {/* ── Interactive Demo Tab ── */}
          <TabsContent value="demo" className="space-y-6">
            {/* Selected Language Indicator */}
            <Card className="bg-gradient-to-r from-emerald-600 to-teal-600 border-0">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedLang.flag}</span>
                    <div className="text-white">
                      <p className="font-semibold">
                        Demo Language: {selectedLang.native} ({selectedLang.name})
                      </p>
                      <p className="text-sm text-emerald-100">
                        All conversations below will be in {selectedLang.name}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-white/20 text-white hover:bg-white/30 border-0"
                    onClick={() => setActiveTab("languages")}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Change
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Scenarios */}
            <div className="space-y-4">
              {scenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  selectedLang={selectedLang}
                />
              ))}
            </div>
          </TabsContent>

          {/* ── How It Works Tab ── */}
          <TabsContent value="info" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900 mb-3">
                    <Mic className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <CardTitle className="text-base">1. Speech-to-Text</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Audio is transcribed using Whisper (local), Deepgram, or Azure
                    Speech. Each provider supports automatic language detection and
                    multi-language models.
                  </p>
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-zinc-500 uppercase">Providers</p>
                    {["Whisper (local)", "Deepgram", "Azure Speech", "AssemblyAI"].map((p) => (
                      <Badge key={p} variant="outline" size="sm" className="mr-1">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900 mb-3">
                    <Brain className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <CardTitle className="text-base">2. LLM Processing</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    The transcribed text is processed by an LLM (Ollama, OpenAI, or
                    Gemini) that generates a context-aware response in the same
                    language.
                  </p>
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-zinc-500 uppercase">Providers</p>
                    {["Ollama (local)", "OpenAI", "Gemini", "OpenRouter"].map((p) => (
                      <Badge key={p} variant="outline" size="sm" className="mr-1">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900 mb-3">
                    <Volume2 className="h-6 w-6 text-amber-600 dark:text-amber-300" />
                  </div>
                  <CardTitle className="text-base">3. Text-to-Speech</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    The LLM response is synthesized into natural-sounding speech
                    using Kokoro (local), ElevenLabs, or XTTS with voice cloning
                    capabilities.
                  </p>
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-zinc-500 uppercase">Providers</p>
                    {["Kokoro (local)", "ElevenLabs", "XTTS", "OpenVoice"].map((p) => (
                      <Badge key={p} variant="outline" size="sm" className="mr-1">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pipeline Diagram */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Voice Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-2 py-4 flex-wrap">
                  {[
                    { label: "Audio Input", icon: Mic, color: "bg-indigo-500" },
                    { label: "STT", icon: Languages, color: "bg-emerald-500" },
                    { label: "LLM", icon: Brain, color: "bg-violet-500" },
                    { label: "TTS", icon: Volume2, color: "bg-amber-500" },
                    { label: "Speech Output", icon: Volume2, color: "bg-rose-500" },
                  ].map((step, i) => (
                    <div key={step.label} className="flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-xl text-white",
                            step.color
                          )}
                        >
                          <step.icon className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-medium text-zinc-500">
                          {step.label}
                        </span>
                      </div>
                      {i < 4 && (
                        <ArrowRight className="h-5 w-5 text-zinc-300 dark:text-zinc-600 mx-1" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
