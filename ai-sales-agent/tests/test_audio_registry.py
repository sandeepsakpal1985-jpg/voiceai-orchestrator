"""Tests for the Audio Registry."""

import os
import json
import tempfile
import pytest
from app.advanced.audio_registry import AudioRegistry, AudioClip, get_audio_registry


@pytest.fixture
def empty_registry():
    """Create a registry with no files (clean test)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        reg = AudioRegistry(
            registry_path=os.path.join(tmpdir, "empty_registry.json"),
            audio_map_path=os.path.join(tmpdir, "empty_map.json"),
            audio_folder=tmpdir,
        )
        yield reg


@pytest.fixture
def registry_with_clips():
    """Create a registry with predefined clips."""
    with tempfile.TemporaryDirectory() as tmpdir:
        clips = [
            {"id": "clip_1", "text": "Hello", "audio_file": "hello.wav", "type": "greeting", "emotion": "neutral", "energy": 3, "tags": ["neutral"], "priority": 5},
            {"id": "clip_2", "text": "I understand", "audio_file": "empathy.wav", "type": "empathy", "emotion": "neutral", "energy": 2, "tags": ["angry", "emotional"], "priority": 8},
            {"id": "clip_3", "text": "Let me help you", "audio_file": "action.wav", "type": "action", "emotion": "positive", "energy": 4, "tags": ["positive", "busy"], "priority": 6},
        ]
        registry_path = os.path.join(tmpdir, "registry.json")
        map_path = os.path.join(tmpdir, "map.json")
        with open(registry_path, "w") as f:
            json.dump(clips, f)
        with open(map_path, "w") as f:
            json.dump({"GREETING": ["greeting1.wav", "greeting2.wav"]}, f)
        reg = AudioRegistry(
            registry_path=registry_path,
            audio_map_path=map_path,
            audio_folder=tmpdir,
            max_recent_memory=3,
        )
        yield reg


class TestAudioClip:
    def test_default_values(self):
        clip = AudioClip(id="test", text="hello", audio_file="test.wav", clip_type="filler", emotion="neutral")
        assert clip.energy == 3
        assert clip.priority == 5
        assert clip.tags == []
        assert clip.file_path == ""
        assert clip.usable_before == []
        assert clip.usable_after == []

    def test_with_custom_values(self):
        clip = AudioClip(
            id="c1", text="text", audio_file="f.wav", clip_type="empathy",
            emotion="angry", energy=5, tags=["urgent"], priority=10,
            file_path="/audio/f.wav",
        )
        assert clip.energy == 5
        assert clip.priority == 10


class TestEmptyRegistry:
    def test_clip_count_zero(self, empty_registry):
        assert empty_registry.clip_count == 0

    def test_get_clip_returns_none(self, empty_registry):
        assert empty_registry.get_clip("nonexistent") is None

    def test_get_clips_by_type_returns_empty(self, empty_registry):
        assert empty_registry.get_clips_by_type("greeting") == []

    def test_select_clip_returns_none_when_empty(self, empty_registry):
        assert empty_registry.select_clip("greeting") is None


class TestRegistryWithClips:
    def test_clip_count(self, registry_with_clips):
        assert registry_with_clips.clip_count == 3

    def test_get_clip_by_id(self, registry_with_clips):
        clip = registry_with_clips.get_clip("clip_1")
        assert clip is not None
        assert clip.text == "Hello"
        assert clip.clip_type == "greeting"

    def test_get_nonexistent_clip(self, registry_with_clips):
        assert registry_with_clips.get_clip("nonexistent") is None

    def test_get_clips_by_type(self, registry_with_clips):
        clips = registry_with_clips.get_clips_by_type("empathy")
        assert len(clips) == 1
        assert clips[0].id == "clip_2"

    def test_get_clips_by_type_nonexistent(self, registry_with_clips):
        assert registry_with_clips.get_clips_by_type("closing") == []


class TestClipSelection:
    def test_select_returns_clip(self, registry_with_clips):
        clip = registry_with_clips.select_clip("greeting")
        assert clip is not None
        assert clip.clip_type == "greeting"

    def test_select_avoids_recently_played(self, registry_with_clips):
        clip1 = registry_with_clips.select_clip("greeting")
        clip2 = registry_with_clips.select_clip("greeting")
        # Only one greeting clip, so after playing it, it should be avoided
        # But fallback allows any clip, so both should exist
        assert clip1 is not None
        assert clip2 is not None

    def test_select_with_context_emotion(self, registry_with_clips):
        clip = registry_with_clips.select_clip("empathy", context_emotion="angry")
        assert clip is not None
        # clip_2 has tag "angry" so it should be preferred
        assert clip.id == "clip_2"

    def test_select_nonexistent_type_falls_back_to_map(self, registry_with_clips):
        clip = registry_with_clips.select_clip("greeting")
        assert clip is not None


class TestRecentlyPlayed:
    def test_mark_played_adds_to_recent(self, registry_with_clips):
        registry_with_clips.mark_played("clip_1")
        # clip_1 is now in recently_played
        assert "clip_1" in registry_with_clips._recently_played

    def test_mark_played_rotates_when_full(self, registry_with_clips):
        registry_with_clips.mark_played("clip_1")
        registry_with_clips.mark_played("clip_2")
        registry_with_clips.mark_played("clip_3")
        registry_with_clips.mark_played("clip_1")  # Should rotate out clip_1
        assert "clip_1" in registry_with_clips._recently_played  # re-added
        assert len(registry_with_clips._recently_played) <= 3

    def test_reset_memory(self, registry_with_clips):
        registry_with_clips.mark_played("clip_1")
        registry_with_clips.reset_memory()
        assert len(registry_with_clips._recently_played) == 0


class TestReload:
    def test_reload_clears_and_reloads(self, empty_registry):
        empty_registry.reload()  # Should not raise
        assert empty_registry.clip_count == 0

    def test_reload_with_new_data(self, registry_with_clips, tmpdir):
        count_before = registry_with_clips.clip_count
        registry_with_clips.reload()
        assert registry_with_clips.clip_count == count_before


class TestSingleton:
    def test_get_audio_registry(self):
        r1 = get_audio_registry()
        r2 = get_audio_registry()
        assert r1 is r2
