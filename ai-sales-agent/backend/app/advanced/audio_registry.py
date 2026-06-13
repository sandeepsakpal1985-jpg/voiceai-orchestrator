"""
Audio Registry — Manages the audio clip library with metadata for adaptive playback.
"""

import json
import logging
import os
import random
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ai_sales_agent.advanced.audio_registry")


@dataclass
class AudioClip:
    id: str
    text: str
    audio_file: str
    clip_type: str
    emotion: str
    energy: int = 3
    tags: list[str] = field(default_factory=list)
    usable_before: list[str] = field(default_factory=list)
    usable_after: list[str] = field(default_factory=list)
    priority: int = 5
    file_path: str = ""


class AudioRegistry:
    """Manages the audio clip library with metadata, repetition prevention, and smart selection."""

    def __init__(self, registry_path: str = "", audio_map_path: str = "", audio_folder: str = "data/audio", max_recent_memory: int = 12):
        self._registry_path = registry_path or os.path.join("data", "audio_registry.json")
        self._audio_map_path = audio_map_path or os.path.join("data", "audio_map.json")
        self._audio_folder = audio_folder
        self._max_recent_memory = max_recent_memory
        self._clips: dict[str, AudioClip] = {}
        self._category_map: dict[str, list[str]] = {}
        self._recently_played: list[str] = []
        self._load()

    def _load(self) -> None:
        if os.path.exists(self._registry_path):
            try:
                with open(self._registry_path) as f:
                    data = json.load(f)
                for item in data:
                    clip = AudioClip(id=item.get("id", ""), text=item.get("text", ""), audio_file=item.get("audio_file", ""), clip_type=item.get("type", "filler"), emotion=item.get("emotion", "neutral"), energy=item.get("energy", 3), tags=item.get("tags", []), usable_before=item.get("usable_before", []), usable_after=item.get("usable_after", []), priority=item.get("priority", 5), file_path=os.path.join(self._audio_folder, item.get("audio_file", "")))
                    self._clips[clip.id] = clip
                logger.info("Loaded %d audio clips from registry", len(self._clips))
            except Exception as e:
                logger.warning("Failed to load audio registry: %s", e)
        if os.path.exists(self._audio_map_path):
            try:
                with open(self._audio_map_path) as f:
                    self._category_map = json.load(f)
                logger.info("Loaded %d audio categories from map", len(self._category_map))
            except Exception as e:
                logger.warning("Failed to load audio map: %s", e)

    def get_clip(self, clip_id: str) -> AudioClip | None:
        return self._clips.get(clip_id)

    def get_clips_by_type(self, clip_type: str) -> list[AudioClip]:
        return [c for c in self._clips.values() if c.clip_type == clip_type]

    def select_clip(self, clip_type: str, context_emotion: str | None = None, previous_type: str | None = None, next_type: str | None = None) -> AudioClip | None:
        candidates = self.get_clips_by_type(clip_type)
        if not candidates:
            files = self._category_map.get(clip_type.upper(), [])
            if files:
                return AudioClip(id=f"map_{clip_type}_0", text="", audio_file=files[0], clip_type=clip_type, emotion="neutral", energy=3, file_path=os.path.join(self._audio_folder, files[0]))
            return None
        available = [c for c in candidates if c.id not in self._recently_played]
        if not available:
            available = candidates
        scored = []
        for clip in available:
            score = clip.priority
            if context_emotion and context_emotion in clip.tags:
                score += 2
            if previous_type and previous_type in clip.usable_after:
                score += 1
            if next_type and next_type in clip.usable_before:
                score += 1
            score += random.uniform(0, 0.5)
            scored.append((score, clip))
        scored.sort(key=lambda x: x[0], reverse=True)
        selected = scored[0][1]
        self.mark_played(selected.id)
        return selected

    def mark_played(self, clip_id: str) -> None:
        self._recently_played.append(clip_id)
        if len(self._recently_played) > self._max_recent_memory:
            self._recently_played.pop(0)

    def reset_memory(self) -> None:
        self._recently_played.clear()

    def reload(self) -> None:
        self._clips.clear()
        self._category_map.clear()
        self._recently_played.clear()
        self._load()

    @property
    def clip_count(self) -> int:
        return len(self._clips)


_registry: AudioRegistry | None = None


def get_audio_registry() -> AudioRegistry:
    global _registry
    if _registry is None:
        _registry = AudioRegistry()
    return _registry
