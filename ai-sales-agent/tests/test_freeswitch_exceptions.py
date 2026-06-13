"""Tests for telephony/freeswitch/exceptions.py — error hierarchy."""

import pytest
from telephony.freeswitch.exceptions import (
    FreeswitchError,
    ESLConnectionError,
    ESLAuthError,
    ESLCommandError,
    CallNotFoundError,
    AudioFileError,
    AudioProcessingError,
    BridgeServiceError,
)


class TestFreeswitchError:
    def test_base_exception(self):
        err = FreeswitchError("Something went wrong")
        assert str(err) == "Something went wrong"
        assert err.cause is None

    def test_with_cause(self):
        cause = ValueError("original error")
        err = FreeswitchError("wrapped", cause=cause)
        assert err.cause is cause


class TestESLConnectionError:
    def test_message_format(self):
        err = ESLConnectionError("127.0.0.1", 8021)
        assert "127.0.0.1" in str(err)
        assert "8021" in str(err)

    def test_with_cause(self):
        cause = ConnectionRefusedError()
        err = ESLConnectionError("127.0.0.1", 8021, cause=cause)
        assert err.cause is cause


class TestESLAuthError:
    def test_default_message(self):
        err = ESLAuthError()
        assert "Authentication" in str(err)

    def test_custom_reason(self):
        err = ESLAuthError("Invalid password")
        assert "Invalid password" in str(err)


class TestESLCommandError:
    def test_message_format(self):
        err = ESLCommandError("status", "-ERR invalid")
        assert "status" in str(err)
        assert "-ERR invalid" in str(err)


class TestCallNotFoundError:
    def test_message_format(self):
        err = CallNotFoundError("abc-123")
        assert "abc-123" in str(err)


class TestAudioFileError:
    def test_message_format(self):
        err = AudioFileError("/tmp/test.wav", "read")
        assert "/tmp/test.wav" in str(err)
        assert "read" in str(err)

    def test_with_cause(self):
        cause = FileNotFoundError()
        err = AudioFileError("/tmp/test.wav", "read", cause=cause)
        assert err.cause is cause


class TestAudioProcessingError:
    def test_default_message(self):
        err = AudioProcessingError()
        assert "audio" in str(err).lower()

    def test_with_cause(self):
        cause = RuntimeError("STT failed")
        err = AudioProcessingError(cause=cause)
        assert err.cause is cause


class TestBridgeServiceError:
    def test_message(self):
        err = BridgeServiceError("ESL disconnected")
        assert "ESL disconnected" in str(err)


class TestInheritance:
    def test_esl_connection_is_freeswitch_error(self):
        assert isinstance(ESLConnectionError("host", 1), FreeswitchError)

    def test_esl_auth_is_freeswitch_error(self):
        assert isinstance(ESLAuthError(), FreeswitchError)

    def test_esl_command_is_freeswitch_error(self):
        assert isinstance(ESLCommandError("cmd", "err"), FreeswitchError)

    def test_call_not_found_is_freeswitch_error(self):
        assert isinstance(CallNotFoundError("id"), FreeswitchError)

    def test_audio_file_is_freeswitch_error(self):
        assert isinstance(AudioFileError("path", "op"), FreeswitchError)

    def test_bridge_service_is_freeswitch_error(self):
        assert isinstance(BridgeServiceError("msg"), FreeswitchError)
