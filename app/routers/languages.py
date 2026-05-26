"""
Languages API — Supported language definitions for multilingual voice AI.

Provides a canonical list of languages supported by the platform,
including STT/TTS provider mappings for each language.

Endpoints:
    GET /api/languages          — All supported languages
    GET /api/languages/{code}   — Single language by code
"""

import logging
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("voiceai.routers.languages")

router = APIRouter(prefix="/api/languages", tags=["Languages"])

# ── Supported Languages ────────────────────────────────────────────
# Canonical list of languages supported across STT, LLM, and TTS providers.

LANGUAGES = [
    {
        "code": "en",
        "name": "English",
        "native": "English",
        "flag": "🇺🇸",
        "voice": "en-US-Wavenet-D",
        "sttProviders": ["Whisper", "Deepgram", "Azure Speech", "AssemblyAI"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini", "OpenRouter"],
        "ttsProviders": ["Kokoro", "ElevenLabs", "XTTS", "OpenVoice"],
        "rtl": False,
        "samples": [
            "Hello! Welcome to VoiceAI. How can I help you today?",
            "Our AI voice platform supports real-time conversations in over 30 languages.",
            "You can deploy agents that speak naturally with your customers worldwide.",
        ],
    },
    {
        "code": "hi",
        "name": "Hindi",
        "native": "हिन्दी",
        "flag": "🇮🇳",
        "voice": "hi-IN-Wavenet-A",
        "sttProviders": ["Whisper", "Deepgram", "Azure Speech"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini"],
        "ttsProviders": ["Kokoro", "ElevenLabs", "XTTS"],
        "rtl": False,
        "samples": [
            "नमस्ते! वॉइसएआई में आपका स्वागत है। मैं आपकी कैसे सहायता कर सकता हूँ?",
            "हमारा AI वॉइस प्लेटफ़ॉर्म 30 से अधिक भाषाओं में रीयल-टाइम बातचीत का समर्थन करता है।",
            "आप ऐसे एजेंट तैनात कर सकते हैं जो आपके ग्राहकों से दुनिया भर में स्वाभाविक रूप से बात करते हैं।",
        ],
    },
    {
        "code": "es",
        "name": "Spanish",
        "native": "Español",
        "flag": "🇪🇸",
        "voice": "es-ES-Wavenet-B",
        "sttProviders": ["Whisper", "Deepgram", "Azure Speech", "AssemblyAI"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini", "OpenRouter"],
        "ttsProviders": ["Kokoro", "ElevenLabs", "XTTS"],
        "rtl": False,
        "samples": [
            "¡Hola! Bienvenido a VoiceAI. ¿Cómo puedo ayudarte hoy?",
            "Nuestra plataforma de voz con IA admite conversaciones en tiempo real en más de 30 idiomas.",
            "Puedes implementar agentes que hablen naturalmente con tus clientes en todo el mundo.",
        ],
    },
    {
        "code": "fr",
        "name": "French",
        "native": "Français",
        "flag": "🇫🇷",
        "voice": "fr-FR-Wavenet-C",
        "sttProviders": ["Whisper", "Deepgram", "Azure Speech", "AssemblyAI"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini", "OpenRouter"],
        "ttsProviders": ["Kokoro", "ElevenLabs", "XTTS"],
        "rtl": False,
        "samples": [
            "Bonjour ! Bienvenue chez VoiceAI. Comment puis-je vous aider aujourd'hui ?",
            "Notre plateforme vocale IA prend en charge les conversations en temps réel dans plus de 30 langues.",
            "Vous pouvez déployer des agents qui parlent naturellement avec vos clients dans le monde entier.",
        ],
    },
    {
        "code": "de",
        "name": "German",
        "native": "Deutsch",
        "flag": "🇩🇪",
        "voice": "de-DE-Wavenet-A",
        "sttProviders": ["Whisper", "Deepgram", "Azure Speech"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini"],
        "ttsProviders": ["Kokoro", "ElevenLabs", "XTTS"],
        "rtl": False,
        "samples": [
            "Hallo! Willkommen bei VoiceAI. Wie kann ich Ihnen heute helfen?",
            "Unsere KI-Sprachplattform unterstützt Echtzeit-Gespräche in über 30 Sprachen.",
            "Sie können Agenten einsetzen, die natürlich mit Ihren Kunden weltweit sprechen.",
        ],
    },
    {
        "code": "ja",
        "name": "Japanese",
        "native": "日本語",
        "flag": "🇯🇵",
        "voice": "ja-JP-Wavenet-C",
        "sttProviders": ["Whisper", "Azure Speech"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini"],
        "ttsProviders": ["Kokoro", "ElevenLabs", "XTTS"],
        "rtl": False,
        "samples": [
            "こんにちは！VoiceAIへようこそ。本日はどのようなご用件でしょうか？",
            "当社のAI音声プラットフォームは、30以上の言語でのリアルタイム会話をサポートしています。",
            "世界中のお客様と自然に会話できるエージェントを展開できます。",
        ],
    },
    {
        "code": "zh",
        "name": "Chinese",
        "native": "中文",
        "flag": "🇨🇳",
        "voice": "zh-CN-Wavenet-A",
        "sttProviders": ["Whisper", "Azure Speech"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini"],
        "ttsProviders": ["Kokoro", "XTTS"],
        "rtl": False,
        "samples": [
            "你好！欢迎来到VoiceAI。今天我能为您做些什么？",
            "我们的AI语音平台支持超过30种语言的实时对话。",
            "您可以部署能够自然地与全球客户交谈的智能代理。",
        ],
    },
    {
        "code": "ar",
        "name": "Arabic",
        "native": "العربية",
        "flag": "🇦🇪",
        "voice": "ar-XA-Wavenet-A",
        "sttProviders": ["Whisper", "Deepgram", "Azure Speech"],
        "llmProviders": ["Ollama", "OpenAI", "Gemini"],
        "ttsProviders": ["ElevenLabs", "XTTS"],
        "rtl": True,
        "samples": [
            "مرحباً! أهلاً بك في VoiceAI. كيف يمكنني مساعدتك اليوم؟",
            "منصتنا الصوتية بالذكاء الاصطناعي تدعم المحادثات الفورية بأكثر من 30 لغة.",
            "يمكنك نشر وكلاء يتحدثون بشكل طبيعي مع عملائك في جميع أنحاء العالم.",
        ],
    },
]


@router.get("")
async def get_languages():
    """Get all supported languages with provider mappings."""
    return {
        "languages": LANGUAGES,
        "total": len(LANGUAGES),
    }


@router.get("/{code}")
async def get_language(code: str):
    """Get a single language by ISO code."""
    for lang in LANGUAGES:
        if lang["code"] == code:
            return lang
    raise HTTPException(status_code=404, detail=f"Language '{code}' not found")
