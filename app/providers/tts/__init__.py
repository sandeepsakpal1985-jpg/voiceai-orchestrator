from .kokoro_provider import KokoroTTSProvider  # [P1] Lightweight local TTS (~82M params)
from .openvoice_provider import OpenVoiceTTSProvider  # [P2] Voice cloning local TTS
from .xtts_real import XTTSTTSProvider  # [P3] Local multi-language TTS (Coqui XTTS-v2)
from .qwen3_provider import Qwen3TTSProvider  # [P4] Qwen3-TTS local TTS
from .elevenlabs_real import ElevenLabsTTSProvider  # Optional cloud TTS

__all__ = [
    "KokoroTTSProvider",  # Priority 1: Lightweight local TTS
    "OpenVoiceTTSProvider",  # Priority 2: Voice cloning local TTS
    "XTTSTTSProvider",  # Priority 3: Local multi-language TTS
    "Qwen3TTSProvider",  # Priority 4: Qwen3-TTS local TTS
    "ElevenLabsTTSProvider",  # Optional cloud TTS
]
