"""
LiveKit Audio Bridge — Audio transport between LiveKit and voice pipeline.
"""

import logging

logger = logging.getLogger("ai_sales_agent.livekit.audio_bridge")


class LiveKitAudioBridge:
    """Bridges audio between LiveKit frames and the voice pipeline byte format."""

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
        """Convert a LiveKit AudioFrame to raw PCM bytes."""
        try:
            import numpy as np
            if hasattr(frame, "data"):
                audio_data = frame.data
                if isinstance(audio_data, np.ndarray):
                    if audio_data.dtype != np.int16:
                        audio_data = (audio_data * 32767).astype(np.int16)
                    return audio_data.tobytes()
            return b""
        except Exception as e:
            logger.warning("Error converting frame: %s", e)
            return b""

    def bytes_to_frame(self, audio_bytes: bytes, sample_rate: int | None = None) -> object:
        """Convert raw PCM bytes to a LiveKit AudioFrame."""
        try:
            import livekit as lk
            import numpy as np
            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
            num_samples = len(audio_array)
            frame = lk.AudioFrame(data=audio_array.tobytes(), sample_rate=sample_rate or self._sample_rate, num_channels=self._num_channels, samples_per_channel=num_samples // self._num_channels)
            return frame
        except ImportError:
            logger.warning("LiveKit SDK not available")
            return None
        except Exception as e:
            logger.warning("Error converting bytes: %s", e)
            return None

    def feed_audio(self, chunk: bytes) -> None:
        self._buffer.extend(chunk)

    def drain_buffer(self) -> bytes | None:
        if not self._buffer:
            return None
        data = bytes(self._buffer)
        self._buffer.clear()
        return data

    def reset(self) -> None:
        self._buffer.clear()
