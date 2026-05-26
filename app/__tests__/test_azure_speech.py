"""
Tests for the Azure Speech STT Provider.

Covers both the real provider (with mocked SDK) and the stub provider.
"""

import pytest

from app.providers.base import STTProvider


class TestAzureSpeechStub:
    """Tests for the Azure Speech stub provider."""

    @pytest.fixture
    def provider(self):
        from app.providers.stt.azure_speech_stub import AzureSpeechSTTProvider

        return AzureSpeechSTTProvider(api_key="test-key")

    def test_provider_name(self, provider):
        assert provider.provider_name == "azure_speech"

    def test_supports_streaming(self, provider):
        assert provider.supports_streaming is True

    def test_is_stt_provider(self, provider):
        assert isinstance(provider, STTProvider)

    @pytest.mark.asyncio
    async def test_transcribe_raises_not_implemented(self, provider):
        with pytest.raises(NotImplementedError, match="not yet implemented"):
            await provider.transcribe(b"fake audio")

    @pytest.mark.asyncio
    async def test_transcribe_stream_raises_not_implemented(self, provider):
        with pytest.raises(NotImplementedError, match="not yet implemented"):
            await provider.transcribe_stream(b"")  # type: ignore

    @pytest.mark.asyncio
    async def test_api_key_stored(self, provider):
        assert provider._api_key == "test-key"
        assert provider._region == "eastus"

    @pytest.mark.asyncio
    async def test_default_region(self):
        from app.providers.stt.azure_speech_stub import AzureSpeechSTTProvider

        provider = AzureSpeechSTTProvider()
        assert provider._region == "eastus"


class TestAzureSpeechRealInit:
    """Tests for the real Azure Speech provider initialization."""

    @pytest.fixture(autouse=True)
    def mock_sdk(self, monkeypatch):
        """Mock the lazy import so tests don't require azure-cognitiveservices-speech."""
        import app.providers.stt.azure_speech_real as mod

        class MockSpeechConfig:
            def __init__(self, **kwargs):
                self.speech_recognition_language = "en"

            def __setattr__(self, name, value):
                super().__setattr__(name, value)

        class MockResult:
            reason = None
            text = "mock transcription"

            def __init__(self):
                self.cancellation_details = None

        class MockRecognizer:
            def recognize_once(self):
                result = MockResult()
                result.reason = "RecognizedSpeech"
                result.text = "mock transcription"
                return result

        class MockAudioConfig:
            @staticmethod
            def filename(path):
                return None

        class MockSpeechsdk:
            class SpeechConfig:
                def __new__(cls, **kwargs):
                    return MockSpeechConfig(**kwargs)

            class SpeechRecognizer:
                def __init__(self, **kwargs):
                    pass

            class AudioConfig:
                filename = MockAudioConfig.filename

            class ResultReason:
                RecognizedSpeech = "RecognizedSpeech"
                NoMatch = "NoMatch"

            class CancellationReason:
                Error = "Error"

        monkeypatch.setattr(mod, "_get_speechsdk", lambda: MockSpeechsdk)

    @pytest.fixture
    def provider(self):
        from app.providers.stt.azure_speech_real import AzureSpeechSTTProvider

        return AzureSpeechSTTProvider(api_key="test-real-key", region="eastus")

    def test_provider_name(self, provider):
        assert provider.provider_name == "azure_speech"

    def test_supports_streaming(self, provider):
        assert provider.supports_streaming is True

    def test_is_stt_provider(self, provider):
        assert isinstance(provider, STTProvider)

    @pytest.mark.asyncio
    async def test_transcribe_requires_api_key(self):
        from app.providers.stt.azure_speech_real import AzureSpeechSTTProvider

        provider = AzureSpeechSTTProvider(api_key="")
        with pytest.raises(ValueError, match="API key is not configured"):
            await provider.transcribe(b"test audio")

    @pytest.mark.asyncio
    async def test_transcribe_stream_requires_api_key(self):
        from app.providers.stt.azure_speech_real import AzureSpeechSTTProvider

        provider = AzureSpeechSTTProvider(api_key="")

        async def empty_stream():
            yield b""

        with pytest.raises(ValueError, match="API key is not configured"):
            async for _ in provider.transcribe_stream(empty_stream()):
                pass

    def test_with_api_key_does_not_raise_on_init(self):
        from app.providers.stt.azure_speech_real import AzureSpeechSTTProvider

        provider = AzureSpeechSTTProvider(api_key="test-key", region="eastus")
        assert provider._api_key == "test-key"
        assert provider._region == "eastus"
        assert provider.provider_name == "azure_speech"

    def test_region_default(self):
        from app.providers.stt.azure_speech_real import AzureSpeechSTTProvider

        provider = AzureSpeechSTTProvider(api_key="test-key")
        assert provider._region == "eastus"

    @pytest.mark.asyncio
    async def test_requires_azure_sdk_for_transcribe(self):
        """If azure.cognitiveservices.speech is not installed, transcribe should raise ImportError."""
        from app.providers.stt.azure_speech_real import AzureSpeechSTTProvider
        import app.providers.stt.azure_speech_real as mod

        provider = AzureSpeechSTTProvider(api_key="test-key")

        def mock_fail():
            raise ImportError("azure-cognitiveservices-speech package is required")

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(mod, "_get_speechsdk", mock_fail)
        try:
            with pytest.raises(ImportError, match="azure-cognitiveservices-speech"):
                await provider.transcribe(b"test audio")
        finally:
            monkeypatch.undo()
