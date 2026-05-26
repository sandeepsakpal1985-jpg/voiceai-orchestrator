/**
 * VoiceAI Dashboard — Languages API Proxy
 *
 * Proxies language data from the backend FastAPI server
 * so the dashboard can dynamically fetch supported languages
 * with STT/TTS provider mappings.
 *
 * GET /api/languages — All supported languages
 * GET /api/languages/:code — Single language
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { log } from "@/lib/monitoring";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * GET /api/languages — Fetch all supported languages from backend.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = code
      ? `${BACKEND_URL}/api/languages/${code}`
      : `${BACKEND_URL}/api/languages`;

    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      // Short timeout — language data is not critical path
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    log({
      level: "warn",
      message: "Failed to fetch languages from backend, using fallback",
      error: (err as Error).message,
    });

    // Fallback: return hardcoded languages if backend is unreachable
    const FALLBACK_LANGUAGES = [
      {
        code: "en", name: "English", native: "English", flag: "🇺🇸",
        voice: "en-US-Wavenet-D", sttProviders: ["Whisper", "Deepgram", "Azure Speech", "AssemblyAI"],
        llmProviders: ["Ollama", "OpenAI", "Gemini", "OpenRouter"],
        ttsProviders: ["Kokoro", "ElevenLabs", "XTTS", "OpenVoice"],
        rtl: false,
        samples: ["Hello! Welcome to VoiceAI. How can I help you today?", "Our AI voice platform supports real-time conversations in over 30 languages.", "You can deploy agents that speak naturally with your customers worldwide."],
      },
      {
        code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳",
        voice: "hi-IN-Wavenet-A", sttProviders: ["Whisper", "Deepgram", "Azure Speech"],
        llmProviders: ["Ollama", "OpenAI", "Gemini"],
        ttsProviders: ["Kokoro", "ElevenLabs", "XTTS"], rtl: false,
        samples: ["नमस्ते! वॉइसएआई में आपका स्वागत है।", "हमारा AI वॉइस प्लेटफ़ॉर्म 30 से अधिक भाषाओं में रीयल-टाइम बातचीत का समर्थन करता है।"],
      },
      {
        code: "es", name: "Spanish", native: "Español", flag: "🇪🇸",
        voice: "es-ES-Wavenet-B", sttProviders: ["Whisper", "Deepgram", "Azure Speech", "AssemblyAI"],
        llmProviders: ["Ollama", "OpenAI", "Gemini", "OpenRouter"],
        ttsProviders: ["Kokoro", "ElevenLabs", "XTTS"], rtl: false,
        samples: ["¡Hola! Bienvenido a VoiceAI. ¿Cómo puedo ayudarte hoy?", "Nuestra plataforma de voz con IA admite conversaciones en tiempo real en más de 30 idiomas."],
      },
      {
        code: "fr", name: "French", native: "Français", flag: "🇫🇷",
        voice: "fr-FR-Wavenet-C", sttProviders: ["Whisper", "Deepgram", "Azure Speech", "AssemblyAI"],
        llmProviders: ["Ollama", "OpenAI", "Gemini", "OpenRouter"],
        ttsProviders: ["Kokoro", "ElevenLabs", "XTTS"], rtl: false,
        samples: ["Bonjour ! Bienvenue chez VoiceAI. Comment puis-je vous aider aujourd'hui ?", "Notre plateforme vocale IA prend en charge les conversations en temps réel dans plus de 30 langues."],
      },
      {
        code: "de", name: "German", native: "Deutsch", flag: "🇩🇪",
        voice: "de-DE-Wavenet-A", sttProviders: ["Whisper", "Deepgram", "Azure Speech"],
        llmProviders: ["Ollama", "OpenAI", "Gemini"],
        ttsProviders: ["Kokoro", "ElevenLabs", "XTTS"], rtl: false,
        samples: ["Hallo! Willkommen bei VoiceAI. Wie kann ich Ihnen heute helfen?", "Unsere KI-Sprachplattform unterstützt Echtzeit-Gespräche in über 30 Sprachen."],
      },
      {
        code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵",
        voice: "ja-JP-Wavenet-C", sttProviders: ["Whisper", "Azure Speech"],
        llmProviders: ["Ollama", "OpenAI", "Gemini"],
        ttsProviders: ["Kokoro", "ElevenLabs", "XTTS"], rtl: false,
        samples: ["こんにちは！VoiceAIへようこそ。", "当社のAI音声プラットフォームは、30以上の言語でのリアルタイム会話をサポートしています。"],
      },
      {
        code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳",
        voice: "zh-CN-Wavenet-A", sttProviders: ["Whisper", "Azure Speech"],
        llmProviders: ["Ollama", "OpenAI", "Gemini"],
        ttsProviders: ["Kokoro", "XTTS"], rtl: false,
        samples: ["你好！欢迎来到VoiceAI。今天我能为您做些什么？", "我们的AI语音平台支持超过30种语言的实时对话。"],
      },
      {
        code: "ar", name: "Arabic", native: "العربية", flag: "🇦🇪",
        voice: "ar-XA-Wavenet-A", sttProviders: ["Whisper", "Deepgram", "Azure Speech"],
        llmProviders: ["Ollama", "OpenAI", "Gemini"],
        ttsProviders: ["ElevenLabs", "XTTS"], rtl: true,
        samples: ["مرحباً! أهلاً بك في VoiceAI. كيف يمكنني مساعدتك اليوم؟", "منصتنا الصوتية بالذكاء الاصطناعي تدعم المحادثات الفورية بأكثر من 30 لغة."],
      },
    ];

    const langCode = searchParams.get("code");
    if (langCode) {
      const lang = FALLBACK_LANGUAGES.find((l) => l.code === langCode);
      return NextResponse.json(lang ?? { error: "Language not found" }, { status: lang ? 200 : 404 });
    }

    return NextResponse.json({ languages: FALLBACK_LANGUAGES, total: FALLBACK_LANGUAGES.length });
  }
}
