"""
FreeSWITCH Exceptions — Error types for the integration layer.
"""


class FreeswitchError(Exception):
    """Base exception for all FreeSWITCH-related errors."""

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class ESLConnectionError(FreeswitchError):
    """Raised when the ESL client cannot connect to FreeSWITCH."""

    def __init__(self, host: str, port: int, cause: Exception | None = None) -> None:
        super().__init__(
            f"Cannot connect to FreeSWITCH ESL at {host}:{port}",
            cause=cause,
        )


class ESLAuthError(FreeswitchError):
    """Raised when ESL authentication fails."""

    def __init__(self, reason: str = "Authentication rejected") -> None:
        super().__init__(f"FreeSWITCH ESL auth failed: {reason}")


class ESLCommandError(FreeswitchError):
    """Raised when an ESL command returns an error."""

    def __init__(self, command: str, response: str) -> None:
        super().__init__(f"ESL command '{command}' failed: {response}")


class CallNotFoundError(FreeswitchError):
    """Raised when a call UUID is not tracked by the bridge service."""

    def __init__(self, call_uuid: str) -> None:
        super().__init__(f"Call {call_uuid} not found in bridge state")


class AudioFileError(FreeswitchError):
    """Raised when audio file operations fail (record, read, play)."""

    def __init__(self, file_path: str, operation: str, cause: Exception | None = None) -> None:
        super().__init__(
            f"Audio {operation} failed for '{file_path}'",
            cause=cause,
        )


class AudioProcessingError(FreeswitchError):
    """Raised when processing audio through the voice pipeline fails."""

    def __init__(self, cause: Exception | None = None) -> None:
        super().__init__(
            "Voice pipeline audio processing error",
            cause=cause,
        )


class BridgeServiceError(FreeswitchError):
    """Raised when the bridge service encounters an unrecoverable error."""

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(message, cause=cause)
