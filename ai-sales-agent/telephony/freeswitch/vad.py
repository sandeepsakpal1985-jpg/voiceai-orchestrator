"""
Voice Activity Detection (VAD) — Energy-based silence detection for natural turn-taking.

Replaces fixed-duration recording with adaptive voice-activity-based recording.
Detects when the caller stops speaking and automatically stops the recording.

This is a lightweight, dependency-free implementation that analyses raw PCM audio.
No external libraries (e.g., webrtcvad, silero-vad) are required.

Algorithm:
  1. Read WAV file → extract PCM samples
  2. Divide into frames (default 30ms)
  3. Compute RMS energy per frame
  4. Classify frames as speech (above threshold) or silence (below threshold)
  5. Detect speech end when silence exceeds the hangover duration
"""

import math
import struct
import wave
from dataclasses import dataclass, field

# Constants for 16-bit PCM WAV
SAMPLE_WIDTH_16BIT = 2
MAX_16BIT = 32768.0


@dataclass
class VADConfig:
    """Configuration for the energy-based VAD."""

    # Frame size in milliseconds (20-40ms recommended)
    frame_ms: int = 30

    # Sample rate in Hz (8000 for telephony, 16000 for wider band)
    sample_rate: int = 8000

    # Energy threshold as a ratio of max amplitude (0.0 - 1.0).
    # Lower = more sensitive (detects quieter speech).
    # Start at 0.02 and adjust based on environment noise.
    energy_threshold: float = 0.02

    # Minimum consecutive silent frames before declaring speech ended.
    # At 30ms frames: 15 frames = 450ms of silence = speech end.
    silence_hangover_frames: int = 15

    # Minimum consecutive speech frames before declaring speech started.
    # At 30ms frames: 3 frames = 90ms to reject short noise bursts.
    speech_min_frames: int = 3

    # Minimum recording duration in seconds (even if VAD triggers sooner)
    min_record_seconds: float = 0.5

    # Maximum recording duration in seconds (safety limit)
    max_record_seconds: float = 8.0


@dataclass
class VADResult:
    """Result from analysing a WAV file for voice activity."""

    # Whether speech was detected
    has_speech: bool = False

    # Duration of speech in seconds
    speech_duration: float = 0.0

    # Total duration analysed in seconds
    total_duration: float = 0.0

    # Percentage of frames classified as speech
    speech_percentage: float = 0.0

    # Frame-by-frame results (True = speech, False = silence)
    frame_classifications: list[bool] = field(default_factory=list)

    # RMS energy per frame (for debugging)
    frame_energies: list[float] = field(default_factory=list)

    # If the recording should be processed (has meaningful speech)
    should_process: bool = False


class EnergyVAD:
    """Energy-based Voice Activity Detector.

    Analyses raw 16-bit PCM audio from WAV files to detect
    when a person has finished speaking.
    """

    def __init__(self, config: VADConfig | None = None) -> None:
        self.config = config or VADConfig()

    def detect_speech_end_from_file(
        self, file_path: str
    ) -> VADResult:
        """Analyse a WAV file and detect where speech ends.

        Args:
            file_path: Path to a WAV file (16-bit PCM, mono).

        Returns:
            VADResult with speech analysis.
        """
        try:
            with wave.open(file_path, "rb") as wf:
                sample_rate = wf.getframerate()
                sample_width = wf.getsampwidth()
                num_channels = wf.getnchannels()
                num_frames = wf.getnframes()
                raw_bytes = wf.readframes(num_frames)
        except Exception:
            return VADResult(should_process=False)

        # Validate format: must be 16-bit PCM
        if sample_width != SAMPLE_WIDTH_16BIT:
            return VADResult(should_process=False)

        return self._analyse_pcm(raw_bytes, sample_rate, num_channels)

    def detect_speech_end_from_bytes(
        self, audio_bytes: bytes, sample_rate: int = 8000
    ) -> VADResult:
        """Analyse raw WAV bytes for voice activity.

        Args:
            audio_bytes: Raw WAV file bytes.
            sample_rate: Expected sample rate (used if WAV header can't be parsed).

        Returns:
            VADResult with speech analysis.
        """
        # Try to parse WAV header
        try:
            # Minimal WAV header parsing (44 bytes)
            if len(audio_bytes) >= 44:
                num_channels = struct.unpack_from("<H", audio_bytes, 22)[0]
                sample_rate = struct.unpack_from("<I", audio_bytes, 24)[0]
                bits_per_sample = struct.unpack_from("<H", audio_bytes, 34)[0]
                data_size = struct.unpack_from("<I", audio_bytes, 40)[0]
                data_start = 44
                raw_pcm = audio_bytes[data_start:data_start + data_size]

                # Validate: must be 16-bit PCM (2 bytes per sample)
                if bits_per_sample != 16:
                    return VADResult(should_process=False)

                return self._analyse_pcm(raw_pcm, sample_rate, num_channels)
        except Exception:
            pass

        return VADResult(should_process=False)

    def _analyse_pcm(
        self, raw_pcm: bytes, sample_rate: int, num_channels: int = 1
    ) -> VADResult:
        """Analyse raw PCM samples for voice activity.

        Args:
            raw_pcm: Raw 16-bit PCM samples.
            sample_rate: Sample rate in Hz.
            num_channels: Number of channels (1=mono).

        Returns:
            VADResult with complete analysis.
        """
        config = self.config
        actual_sample_rate = sample_rate or config.sample_rate

        # Calculate frame size in samples
        frame_samples = int(actual_sample_rate * config.frame_ms / 1000)
        if frame_samples < 1:
            frame_samples = 1

        # Convert raw bytes to PCM samples (16-bit signed, mono)
        # If stereo, average channels
        samples_per_channel = len(raw_pcm) // (SAMPLE_WIDTH_16BIT * num_channels)
        samples = []
        for i in range(samples_per_channel):
            offset = i * SAMPLE_WIDTH_16BIT * num_channels
            # Take first channel (or average for stereo)
            sample = struct.unpack_from("<h", raw_pcm, offset)[0]
            samples.append(sample)

        total_samples = len(samples)
        if total_samples == 0:
            return VADResult(should_process=False)

        # Divide into frames and compute RMS energy per frame
        num_frames = max(1, total_samples // frame_samples)
        frame_energies: list[float] = []
        frame_classifications: list[bool] = []

        for f in range(num_frames):
            start = f * frame_samples
            end = min(start + frame_samples, total_samples)
            frame = samples[start:end]

            # Compute RMS energy
            if len(frame) == 0:
                energy = 0.0
            else:
                sum_sq = sum(s * s for s in frame)
                rms = math.sqrt(sum_sq / len(frame))
                energy = rms / MAX_16BIT  # Normalize to 0-1

            frame_energies.append(energy)
            is_speech = energy >= config.energy_threshold
            frame_classifications.append(is_speech)

        # Apply speech hangover logic
        # A speech segment ends when silence_hangover_frames consecutive silent frames
        # occur after at least speech_min_frames of speech.
        speech_frames = 0
        silence_frames = 0
        speech_started = False
        speech_ended = False
        speech_start_frame = 0
        speech_end_frame = num_frames

        for f in range(num_frames):
            if frame_classifications[f]:
                silence_frames = 0
                speech_frames += 1
                if not speech_started and speech_frames >= config.speech_min_frames:
                    speech_started = True
                    speech_start_frame = f
            else:
                if speech_started and not speech_ended:
                    silence_frames += 1
                    if silence_frames >= config.silence_hangover_frames:
                        speech_ended = True
                        speech_end_frame = f - config.silence_hangover_frames
                else:
                    speech_frames = 0

        if not speech_started:
            speech_end_frame = 0
        elif speech_end_frame == num_frames:
            # Speech didn't end within the recording
            speech_end_frame = num_frames - 1

        # Calculate durations
        speech_duration = (speech_end_frame - speech_start_frame) * config.frame_ms / 1000.0
        total_duration = num_frames * config.frame_ms / 1000.0
        speech_pct = (speech_frames / max(1, num_frames)) * 100.0 if speech_started else 0.0

        # Determine if we should process this recording
        should_process = (
            speech_started
            and speech_duration >= config.min_record_seconds
        )

        return VADResult(
            has_speech=speech_started,
            speech_duration=max(speech_duration, 0.0),
            total_duration=total_duration,
            speech_percentage=speech_pct,
            frame_classifications=frame_classifications,
            frame_energies=frame_energies,
            should_process=should_process,
        )


# ── Singleton ──

_vad_instance: EnergyVAD | None = None


def get_vad(config: VADConfig | None = None) -> EnergyVAD:
    """Get the default VAD instance."""
    global _vad_instance
    if _vad_instance is None:
        _vad_instance = EnergyVAD(config=config)
    return _vad_instance


def reset_vad() -> None:
    """Reset the VAD singleton for testing."""
    global _vad_instance
    _vad_instance = None
