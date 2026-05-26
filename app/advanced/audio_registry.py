"""
Audio Registry — Manages the audio clip library with metadata for adaptive playback.

Integrates audio_map.json and audio_registry.json into a single service
that the adaptive playback engine uses to select appropriate audio clips
based on emotional context, track repetition, and sequence requirements.
"""

import json
import logging
import os
import random
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("voiceai.advanced.audio_registry")


@dataclass
class AudioClip:
    """Metadata for a single audio clip in the registry."""
    id: str
    text: str
    audio_file: str
    clip_type: str  # empathy, reassurance, filler, apology, validation, action, question, closing
    emotion: str  # soft, calming, supportive, professional, warm
    energy: int = 3  # 1-5 energy level, default mid-range
    tags: list[str] = field(default_factory=list)
    usable_before: list[str] = field(default_factory=list)
    usable_after: list[str] = field(default_factory=list)
    priority: int = 5
    file_path: str = ""


class AudioRegistry:
    """Manages the audio clip library with metadata, repetition prevention, and smart selection.

    This integrates:
    - audio_registry.json → detailed clip metadata with context rules
    - audio_map.json → category-to-file mapping
    - intelligent_orchestrator.py → repetition prevention with memory
    - semantic_selector.py → context-aware clip selection
    """

    def __init__(
        self,
        registry_path: str = "audio_registry.json",
        audio_map_path: str = "audio_map.json",
        audio_folder: str = "audio",
        max_recent_memory: int = 12,
    ):
        self._registry_path = registry_path
        self._audio_map_path = audio_map_path
        self._audio_folder = audio_folder
        self._max_recent_memory = max_recent_memory

        self._clips: dict[str, AudioClip] = {}
        self._category_map: dict[str, list[str]] = {}
        self._recently_played: list[str] = []

        self._load()

    # ── Loading ────────────────────────────────────────────────────

    def _load(self) -> None:
        """Load clips from audio_registry.json and map from audio_map.json."""
        # Load audio_registry.json
        if os.path.exists(self._registry_path):
            try:
                with open(self._registry_path) as f:
                    data = json.load(f)
                for item in data:
                    clip = AudioClip(
                        id=item.get("id", ""),
                        text=item.get("text", ""),
                        audio_file=item.get("audio_file", ""),
                        clip_type=item.get("type", "filler"),
                        emotion=item.get("emotion", "neutral"),
                        energy=item.get("energy", 3),
                        tags=item.get("tags", []),
                        usable_before=item.get("usable_before", []),
                        usable_after=item.get("usable_after", []),
                        priority=item.get("priority", 5),
                        file_path=os.path.join(self._audio_folder, item.get("audio_file", "")),
                    )
                    self._clips[clip.id] = clip
                logger.info(f"Loaded {len(self._clips)} audio clips from registry")
            except Exception as e:
                logger.warning(f"Failed to load audio registry: {e}")

        # Load audio_map.json for category mapping
        if os.path.exists(self._audio_map_path):
            try:
                with open(self._audio_map_path) as f:
                    self._category_map = json.load(f)
                logger.info(f"Loaded {len(self._category_map)} audio categories from map")
            except Exception as e:
                logger.warning(f"Failed to load audio map: {e}")

    # ── Querying ───────────────────────────────────────────────────

    def get_clip(self, clip_id: str) -> AudioClip | None:
        """Get a specific clip by ID."""
        return self._clips.get(clip_id)

    def get_clips_by_type(self, clip_type: str) -> list[AudioClip]:
        """Get all clips of a given type (empathy, reassurance, filler, etc.)."""
        return [c for c in self._clips.values() if c.clip_type == clip_type]

    def get_clips_by_tag(self, tag: str) -> list[AudioClip]:
        """Get all clips with a given tag."""
        return [c for c in self._clips.values() if tag in c.tags]

    def get_category_files(self, category: str) -> list[str]:
        """Get audio file names from the category map (audio_map.json)."""
        return self._category_map.get(category.upper(), [])

    def get_all_types(self) -> list[str]:
        """Get all available clip types."""
        return list(set(c.clip_type for c in self._clips.values()))

    def get_all_categories(self) -> list[str]:
        """Get all available categories from the audio map."""
        return list(self._category_map.keys())

    # ── Smart Selection (from intelligent_orchestrator.py / semantic_selector.py) ──

    def select_clip(
        self,
        clip_type: str,
        context_emotion: str | None = None,
        previous_type: str | None = None,
        next_type: str | None = None,
    ) -> AudioClip | None:
        """Select the best clip for the given context, avoiding repetition.

        Args:
            clip_type: Required clip type (empathy, reassurance, etc.)
            context_emotion: Current customer emotion for tag matching
            previous_type: The type of the previous clip (for flow continuity)
            next_type: The next expected clip type (for flow continuity)

        Returns:
            Best matching AudioClip, or None if no clips available
        """
        candidates = self.get_clips_by_type(clip_type)

        if not candidates:
            # Fall back to category map
            files = self.get_category_files(clip_type.upper())
            if files:
                return AudioClip(
                    id=f"map_{clip_type}_0",
                    text="",
                    audio_file=files[0],
                    clip_type=clip_type,
                    emotion="neutral",
                    energy=3,
                    file_path=os.path.join(self._audio_folder, files[0]),
                )
            return None

        # Filter out recently played
        available = [c for c in candidates if c.id not in self._recently_played]
        if not available:
            available = candidates  # Reset if all played

        # Score candidates
        scored = []
        for clip in available:
            score = clip.priority

            # Bonus for matching emotion tag
            if context_emotion and context_emotion in clip.tags:
                score += 2

            # Bonus for flow continuity
            if previous_type and previous_type in clip.usable_after:
                score += 1
            if next_type and next_type in clip.usable_before:
                score += 1

            # Random factor to add variety
            score += random.uniform(0, 0.5)

            scored.append((score, clip))

        # Sort by score descending
        scored.sort(key=lambda x: x[0], reverse=True)

        selected = scored[0][1]

        # Track repetition
        self.mark_played(selected.id)

        return selected

    def get_content_for_type(
        self, intent_type: str, context_emotion: str | None = None
    ) -> str | None:
        """Get audio content text for a given intent type.

        This is used by the LLM pipeline to inject audio clip context.
        """
        clip = self.select_clip(intent_type, context_emotion=context_emotion)
        if clip and clip.text:
            return clip.text
        return None

    # ── Repetition Prevention (from intelligent_orchestrator.py) ──

    def mark_played(self, clip_id: str) -> None:
        """Mark a clip as recently played."""
        self._recently_played.append(clip_id)
        if len(self._recently_played) > self._max_recent_memory:
            self._recently_played.pop(0)

    def is_recently_played(self, clip_id: str) -> bool:
        """Check if a clip was recently played."""
        return clip_id in self._recently_played

    def reset_memory(self) -> None:
        """Reset the recently-played memory."""
        self._recently_played.clear()

    # ── Utility ────────────────────────────────────────────────────

    def reload(self) -> None:
        """Reload the registry from disk and reset play memory."""
        self._clips.clear()
        self._category_map.clear()
        self._recently_played.clear()
        self._load()

    @property
    def clip_count(self) -> int:
        return len(self._clips)

    @property
    def category_count(self) -> int:
        return len(self._category_map)

    def __repr__(self) -> str:
        return f"AudioRegistry(clips={self.clip_count}, categories={self.category_count})"


# ── Singleton ───────────────────────────────────────────────────────

_registry: AudioRegistry | None = None


def get_audio_registry() -> AudioRegistry:
    global _registry
    if _registry is None:
        _registry = AudioRegistry()
    return _registry
