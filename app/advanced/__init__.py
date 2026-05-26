"""
Advanced Conversation Modules — Production-grade conversation intelligence.

This package integrates the concepts from the root-level standalone scripts:
- realtime_conversation.py      → Real-time STT + interruption loop
- adaptive_playback.py          → Emotional pacing and audio playback
- intelligent_orchestrator.py   → Smart orchestration with repetition prevention
- conversation_analyzer.py      → Semantic analysis with Sentence Transformers
- live_interrupt_detector.py    → Real-time microphone barge-in detection
- interruptible_runtime.py      → Interruption handling and recovery
- state_engine.py               → Conversation state machine
- live_state_engine.py          → Real-time state with emotion tracking
- semantic_selector.py          → Semantic audio clip selection
- semantic_player.py            → Semantic playback engine
- playback_engine.py            → Playback queue management
- dynamic_flow.py               → Dynamic flow generation
- demo_conversation.py          → Conversation demonstration

All refactored into clean, testable modules with proper async support.
"""

from .audio_registry import AudioRegistry, AudioClip, get_audio_registry
from .adaptive_playback import (
    AdaptivePlaybackEngine,
    ConversationProfile,
    PlaybackItem,
    get_adaptive_playback_engine,
)
from .interrupt_detector import (
    InterruptDetector,
    get_interrupt_detector,
)
from .conversation_analyzer import (
    ConversationAnalyzer,
    get_conversation_analyzer,
)
from .state_engine import (
    ConversationStateEngine,
    StateTransition,
    get_state_engine,
)
from .orchestrator import (
    RealtimeConversationOrchestrator,
    OrchestratorState,
    get_orchestrator,
    reset_orchestrator,
)

__all__ = [
    # Audio Registry
    "AudioRegistry",
    "AudioClip",
    "get_audio_registry",
    # Adaptive Playback
    "AdaptivePlaybackEngine",
    "ConversationProfile",
    "PlaybackItem",
    "get_adaptive_playback_engine",
    # Interrupt Detection
    "InterruptDetector",
    "get_interrupt_detector",
    # Conversation Analysis
    "ConversationAnalyzer",
    "get_conversation_analyzer",
    # State Engine
    "ConversationStateEngine",
    "StateTransition",
    "get_state_engine",
    # Orchestrator
    "RealtimeConversationOrchestrator",
    "OrchestratorState",
    "get_orchestrator",
    "reset_orchestrator",
]
