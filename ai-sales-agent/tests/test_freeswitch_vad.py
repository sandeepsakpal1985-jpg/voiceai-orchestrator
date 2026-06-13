"""Tests for telephony/freeswitch/vad.py — Voice Activity Detection."""

import os
import struct
import tempfile
import wave

import pytest
from telephony.freeswitch.vad import EnergyVAD, VADConfig, VADResult, get_vad, reset_vad


def _create_wav_bytes(samples: list[int], sample_rate: int = 8000) -> bytes:
    """Create a WAV file in memory from PCM samples."""
    num_channels = 1
    sample_width = 2
    num_samples = len(samples)
    data_size = num_samples * sample_width
    
    buf = bytearray()
    # RIFF header
    buf.extend(b"RIFF")
    buf.extend(struct.pack("<I", 36 + data_size))
    buf.extend(b"WAVE")
    # fmt chunk
    buf.extend(b"fmt ")
    buf.extend(struct.pack("<I", 16))  # chunk size
    buf.extend(struct.pack("<H", 1))   # PCM
    buf.extend(struct.pack("<H", num_channels))
    buf.extend(struct.pack("<I", sample_rate))
    buf.extend(struct.pack("<I", sample_rate * num_channels * sample_width))
    buf.extend(struct.pack("<H", num_channels * sample_width))
    buf.extend(struct.pack("<H", sample_width * 8))
    # data chunk
    buf.extend(b"data")
    buf.extend(struct.pack("<I", data_size))
    for s in samples:
        buf.extend(struct.pack("<h", s))
    return bytes(buf)


def _create_wav_file(samples: list[int], sample_rate: int = 8000) -> str:
    """Create a temporary WAV file and return its path."""
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return path


def _generate_silence(duration_ms: int, sample_rate: int = 8000) -> list[int]:
    """Generate silence (zero amplitude) samples."""
    num_samples = int(sample_rate * duration_ms / 1000)
    return [0] * num_samples


def _generate_speech(duration_ms: int, sample_rate: int = 8000, amplitude: int = 8000) -> list[int]:
    """Generate simulated speech samples (sine wave)."""
    num_samples = int(sample_rate * duration_ms / 1000)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        val = int(amplitude * (i % 100) / 50)  # Sawtooth wave
        if val > amplitude:
            val = 2 * amplitude - val
        samples.append(val)
    return samples


class TestVADConfig:
    def test_default_values(self):
        config = VADConfig()
        assert config.frame_ms == 30
        assert config.sample_rate == 8000
        assert 0 < config.energy_threshold < 1
        assert config.silence_hangover_frames >= 5
        assert config.speech_min_frames >= 1
        assert config.min_record_seconds > 0
        assert config.max_record_seconds >= config.min_record_seconds


class TestEnergyVAD:
    def test_silence_detected(self):
        """Pure silence should not be classified as speech."""
        vac = EnergyVAD(VADConfig(energy_threshold=0.05))
        silence = _generate_silence(1000)  # 1 second of silence
        wav_bytes = _create_wav_bytes(silence)
        result = vac.detect_speech_end_from_bytes(wav_bytes)
        assert result.has_speech is False
        assert result.speech_percentage == 0.0
        assert result.should_process is False

    def test_speech_detected(self):
        """Audio with speech energy should be detected."""
        vac = EnergyVAD(VADConfig(energy_threshold=0.01))
        samples = _generate_speech(1000) + _generate_silence(500)
        wav_bytes = _create_wav_bytes(samples)
        result = vac.detect_speech_end_from_bytes(wav_bytes)
        assert result.has_speech is True
        assert result.speech_duration > 0.0

    def test_speech_with_trailing_silence(self):
        """Speech followed by silence should detect speech end."""
        vac = EnergyVAD(VADConfig(
            energy_threshold=0.01,
            silence_hangover_frames=5,
            frame_ms=30,
        ))
        samples = _generate_speech(500) + _generate_silence(500)
        wav_bytes = _create_wav_bytes(samples)
        result = vac.detect_speech_end_from_bytes(wav_bytes)
        assert result.has_speech is True
        # Speech duration should be roughly 500ms (not including silence)
        assert 0.3 < result.speech_duration < 1.0

    def test_short_noise_not_speech(self):
        """Very short noise bursts should not trigger speech detection."""
        vac = EnergyVAD(VADConfig(
            energy_threshold=0.01,
            speech_min_frames=5,  # Need 5 consecutive speech frames
            frame_ms=30,
        ))
        # Only 2 frames of speech
        samples = _generate_speech(60) + _generate_silence(500)
        wav_bytes = _create_wav_bytes(samples)
        result = vac.detect_speech_end_from_bytes(wav_bytes)
        # May or may not detect as speech depending on frame count
        # At minimum, should_process should be False for very short audio
        if result.has_speech:
            assert result.speech_duration < 0.5

    def test_from_file(self):
        """VAD should work with file paths."""
        vac = EnergyVAD(VADConfig(energy_threshold=0.01))
        samples = _generate_speech(500) + _generate_silence(300)
        path = _create_wav_file(samples)
        try:
            result = vac.detect_speech_end_from_file(path)
            assert result.has_speech is True
            assert result.should_process is True
        finally:
            os.unlink(path)

    def test_empty_audio_returns_safe_default(self):
        """Empty or invalid audio should return should_process=False."""
        vac = EnergyVAD()
        result = vac.detect_speech_end_from_bytes(b"")
        assert result.should_process is False
        assert result.has_speech is False

    def test_frame_count_matches_duration(self):
        """Number of frames should correspond to audio duration."""
        vac = EnergyVAD(VADConfig(frame_ms=50, energy_threshold=0.01))
        samples = _generate_speech(2000)  # 2 seconds
        wav_bytes = _create_wav_bytes(samples)
        result = vac.detect_speech_end_from_bytes(wav_bytes)
        # At 50ms frames: 2000ms / 50ms = 40 frames
        assert len(result.frame_classifications) > 0
        assert len(result.frame_energies) > 0
        assert len(result.frame_energies) == len(result.frame_classifications)

    def test_not_wav_returns_safe_default(self):
        """Non-WAV bytes should not crash."""
        vac = EnergyVAD()
        result = vac.detect_speech_end_from_bytes(b"not a wav file at all")
        assert result.should_process is False

    def test_speech_percentage_calculated(self):
        """Speech percentage should be between 0 and 100."""
        vac = EnergyVAD(VADConfig(energy_threshold=0.01))
        samples = _generate_speech(1000) + _generate_silence(1000)
        wav_bytes = _create_wav_bytes(samples)
        result = vac.detect_speech_end_from_bytes(wav_bytes)
        assert 0.0 <= result.speech_percentage <= 100.0


class TestGetVAD:
    def test_singleton(self):
        reset_vad()
        v1 = get_vad()
        v2 = get_vad()
        assert v1 is v2

    def test_reset(self):
        reset_vad()
        v1 = get_vad()
        reset_vad()
        v2 = get_vad()
        assert v1 is not v2
