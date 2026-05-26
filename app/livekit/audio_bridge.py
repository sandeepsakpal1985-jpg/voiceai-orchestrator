"""
LiveKit Audio Bridge — Audio transport between LiveKit and voice pipeline.

Handles the conversion between LiveKit audio frames and the voice
pipeline's byte-based audio format.
"""

import logging
from typing import AsyncIterator

logger = logging.getLogger("voiceai.livekit.audio_bridge")


class LiveKitAudioBridge:
    """Bridges audio between LiveKit frames and the voice pipeline.

    Converts LiveKit AudioFrame objects to raw bytes for the STT
    pipeline, and raw audio bytes back to LiveKit frames for publishing.

    Usage:
        bridge = LiveKitAudioBridge()
        # Convert LiveKit frame to bytes for STT
        audio_bytes = bridge.frame_to_bytes(frame)
        # Convert synthesis output to LiveKit source
        await bridge.publish_audio(room, audio_bytes)
    """

    def __init__(self, sample_rate: int = 16000, num_channels: int = 1):
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._buffer = bytearray()

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    @property
    def num_channels(self) -> int:
        return self._num_channels

    def frame_to_bytes(self, frame: object) -> bytes:
        """Convert a LiveKit AudioFrame to raw PCM bytes.

        Args:
            frame: LiveKit AudioFrame object

        Returns:
            Raw PCM16 mono bytes
        """
        try:
            import numpy as np
            # LiveKit frames have a .data attribute (numpy array)
            if hasattr(frame, "data"):
                audio_data = frame.data
                if isinstance(audio_data, np.ndarray):
                    # Convert to int16 PCM
                    if audio_data.dtype != np.int16:
                        audio_data = (audio_data * 32767).astype(np.int16)
                    return audio_data.tobytes()
            return b""
        except Exception as e:
            logger.warning("Error converting frame to bytes: %s", e)
            return b""

    def bytes_to_frame(self, audio_bytes: bytes, sample_rate: int | None = None) -> object:
        """Convert raw PCM bytes to a LiveKit AudioFrame.

        Args:
            audio_bytes: Raw PCM16 audio bytes
            sample_rate: Sample rate (defaults to bridge sample rate)

        Returns:
            LiveKit AudioFrame
        """
        try:
            import livekit as lk
            import numpy as np

            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
            num_samples = len(audio_array)
            num_channels = self._num_channels

            frame = lk.AudioFrame(
                data=audio_array.tobytes(),
                sample_rate=sample_rate or self._sample_rate,
                num_channels=num_channels,
                samples_per_channel=num_samples // num_channels,
            )
            return frame
        except ImportError:
            logger.warning("LiveKit SDK not available for frame conversion")
            return None
        except Exception as e:
            logger.warning("Error converting bytes to frame: %s", e)
            return None

    def feed_audio(self, chunk: bytes) -> None:
        """Feed audio data into the bridge buffer.

        Used for accumulating audio before processing.
        """
        self._buffer.extend(chunk)

    def drain_buffer(self) -> bytes | None:
        """Drain the accumulated buffer and return its contents.

        Returns:
            Audio bytes, or None if buffer is empty
        """
        if not self._buffer:
            return None
        data = bytes(self._buffer)
        self._buffer.clear()
        return data

    def reset(self) -> None:
        """Reset the bridge state."""
        self._buffer.clear()
