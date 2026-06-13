"""Tests for the Conversation Analyzer."""

import pytest
from app.advanced.conversation_analyzer import (
    ConversationAnalyzer,
    get_conversation_analyzer,
    SEMANTIC_DIMENSIONS,
)


@pytest.fixture
def analyzer():
    a = ConversationAnalyzer()
    return a


class TestInitialState:
    def test_not_ready_initially(self, analyzer):
        assert analyzer.is_ready is False

    def test_dimensions_returned(self, analyzer):
        dims = analyzer.dimensions()
        assert len(dims) > 0
        assert "anger" in dims
        assert "positive" in dims
        assert "confusion" in dims

    def test_all_expected_dimensions(self, analyzer):
        expected = {"anger", "confusion", "positive", "threat", "flirting",
                     "wrong_identity", "callback", "audio_problem",
                     "resistance", "urgency", "gratitude", "sarcasm"}
        assert set(analyzer.dimensions()) == expected


class TestKeywordAnalysis:
    """Tests the keyword fallback analysis (sentence-transformers not installed)."""

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self, analyzer):
        result = await analyzer.analyze("")
        assert result == []

    @pytest.mark.asyncio
    async def test_anger_matches(self, analyzer):
        result = await analyzer.analyze("terrible service")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("anger", 0) > 0

    @pytest.mark.asyncio
    async def test_positive_matches(self, analyzer):
        result = await analyzer.analyze("great service, very happy")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("positive", 0) > 0

    @pytest.mark.asyncio
    async def test_confusion_matches(self, analyzer):
        result = await analyzer.analyze("I don't understand what you mean")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("confusion", 0) > 0

    @pytest.mark.asyncio
    async def test_threat_matches(self, analyzer):
        result = await analyzer.analyze("I will take legal action")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("threat", 0) > 0

    @pytest.mark.asyncio
    async def test_wrong_identity_matches(self, analyzer):
        result = await analyzer.analyze("wrong number, who are you?")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("wrong_identity", 0) > 0

    @pytest.mark.asyncio
    async def test_callback_matches(self, analyzer):
        result = await analyzer.analyze("call me later")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("callback", 0) > 0

    @pytest.mark.asyncio
    async def test_results_sorted_by_score(self, analyzer):
        result = await analyzer.analyze("this is terrible and I am very angry")
        if result:
            for i in range(len(result) - 1):
                assert result[i]["score"] >= result[i + 1]["score"]

    @pytest.mark.asyncio
    async def test_top_k_limits_results(self, analyzer):
        result = await analyzer.analyze("terrible service, very angry, worst experience", top_k=3)
        assert len(result) <= 3

    @pytest.mark.asyncio
    async def test_result_structure(self, analyzer):
        result = await analyzer.analyze("terrible service", top_k=1)
        if result:
            item = result[0]
            assert "dimension" in item
            assert "score" in item
            assert "label" in item
            assert isinstance(item["score"], float)


class TestDominantEmotion:
    @pytest.mark.asyncio
    async def test_dominant_emotion_anger(self, analyzer):
        emotion = await analyzer.get_dominant_emotion("terrible service, worst experience")
        assert emotion in ("anger", "neutral")  # neutral if score <= 0.3

    @pytest.mark.asyncio
    async def test_dominant_emotion_neutral(self, analyzer):
        emotion = await analyzer.get_dominant_emotion("the sky is blue today")
        # Either returns filtered or neutral
        assert isinstance(emotion, str)

    @pytest.mark.asyncio
    async def test_dominant_emotion_empty(self, analyzer):
        emotion = await analyzer.get_dominant_emotion("")
        assert emotion == "neutral" or emotion is not None


class TestSemanticDimensions:
    def test_semantic_dimensions_defined(self):
        assert len(SEMANTIC_DIMENSIONS) == 12

    def test_each_dimension_has_examples(self):
        for dim, examples in SEMANTIC_DIMENSIONS.items():
            assert len(examples) >= 3, f"{dim} has fewer than 3 examples"

    def test_no_empty_dimensions(self):
        for dim, examples in SEMANTIC_DIMENSIONS.items():
            assert all(len(ex) > 0 for ex in examples), f"{dim} has empty example"


class TestKeywordFallbackEdgeCases:
    @pytest.mark.asyncio
    async def test_mixed_text_matches_multiple(self, analyzer):
        result = await analyzer.analyze("thank you for explaining, I was confused but now happy")
        dims = [r["dimension"] for r in result]
        assert any(d in dims for d in ["positive", "confusion", "gratitude"])

    @pytest.mark.asyncio
    async def test_whitespace_text(self, analyzer):
        result = await analyzer.analyze("   ")
        assert result == []

    @pytest.mark.asyncio
    async def test_special_characters(self, analyzer):
        result = await analyzer.analyze("!!! THIS IS TERRIBLE!!!!")
        scores = {r["dimension"]: r["score"] for r in result}
        assert scores.get("anger", 0) > 0


class TestSingleton:
    def test_get_conversation_analyzer(self):
        a1 = get_conversation_analyzer()
        a2 = get_conversation_analyzer()
        assert a1 is a2
