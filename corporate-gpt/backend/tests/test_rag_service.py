"""
Tests for RAG Service
Tests query modes (strict, general, expert), search, and document indexing.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_llm_response():
    """Canned LLM response for tests."""
    return "This is a test response about company policy."


@pytest.fixture
def mock_search_results():
    """Mock search results from RAGProvider."""
    return [
        {
            "text": "Employees are entitled to 18 annual leave days per year.",
            "score": 0.92,
            "document_id": "doc-001",
            "filename": "HR_Policy_2024.pdf",
            "metadata": {"department": "HR"},
        },
        {
            "text": "Sick leave policy allows 12 sick days per year with doctor's note.",
            "score": 0.85,
            "document_id": "doc-002",
            "filename": "Leave_Policy.pdf",
            "metadata": {"department": "HR"},
        },
    ]


@pytest.fixture
def rag_service(mock_llm_response):
    """Create RAGService with all dependencies mocked.
    Patches llama_index classes BEFORE import to avoid model validation errors.
    Also patches LLMService on the module so _strict_query etc. return canned responses.
    """
    mock_llm_instance = MagicMock()
    mock_llm_instance.complete = AsyncMock(return_value=mock_llm_response)
    mock_llm_cls = MagicMock()
    mock_llm_cls.return_value = mock_llm_instance

    # Patch llama_index before any RAG imports trigger model validation
    with patch("llama_index.core.Settings") as LiSettings:
        LiSettings.llm = MagicMock()
        LiSettings.embed_model = MagicMock()
        with patch("llama_index.llms.openai.OpenAI", MagicMock()):
            with patch("llama_index.embeddings.openai.OpenAIEmbedding", MagicMock()):
                with patch("app.services.rag_service.LiSettings", LiSettings):
                    with patch("app.services.llm_service.LLMService", mock_llm_cls):
                        # Now safe to import - llama_index classes are mocked
                        from app.services.rag_service import RAGService
                        service = RAGService()

                        yield (mock_llm_instance, service)


async def test_strict_query_returns_answer_with_citations(rag_service, mock_search_results, org_id):
    """Test STRICT mode returns answer with citations from documents."""
    mock_llm_instance, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=mock_search_results)):
        result = await service.query(
            organization_id=org_id,
            query="What is the leave policy?",
            mode="strict",
        )

    assert "answer" in result
    assert "citations" in result
    assert result["mode"] == "strict"
    assert len(result["citations"]) > 0
    assert mock_llm_instance.complete.called


async def test_strict_query_no_results_returns_not_found(rag_service, org_id):
    """Test STRICT mode returns 'not found' when no documents match."""
    _, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=[])):
        result = await service.query(
            organization_id=org_id,
            query="What is the quantum computing policy?",
            mode="strict",
        )

    assert "answer" in result
    assert "could not find" in result["answer"].lower()


async def test_general_query_uses_both_docs_and_llm(rag_service, mock_search_results, org_id):
    """Test GENERAL mode combines company docs with LLM reasoning."""
    mock_llm_instance, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=mock_search_results)):
        result = await service.query(
            organization_id=org_id,
            query="What is the leave policy?",
            mode="general",
        )

    assert result["mode"] == "general"
    assert len(result["citations"]) > 0
    assert mock_llm_instance.complete.called


async def test_general_query_no_docs_still_returns_answer(rag_service, org_id):
    """Test GENERAL mode works even without matching documents."""
    mock_llm_instance, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=[])):
        result = await service.query(
            organization_id=org_id,
            query="What is the meaning of life?",
            mode="general",
        )

    assert result["mode"] == "general"
    assert mock_llm_instance.complete.called  # LLM should still respond with general knowledge


async def test_expert_query_detailed_response(rag_service, mock_search_results, org_id):
    """Test EXPERT mode gives comprehensive subject-matter expert answers."""
    _, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=mock_search_results)):
        result = await service.query(
            organization_id=org_id,
            query="Explain the leave approval process",
            mode="expert",
        )

    assert result["mode"] == "expert"
    assert "answer" in result
    assert len(result["citations"]) > 0


async def test_unknown_mode_defaults_to_strict(rag_service, mock_search_results, org_id):
    """Test unknown mode falls back to strict behavior."""
    _, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=mock_search_results)):
        result = await service.query(
            organization_id=org_id,
            query="What is the leave policy?",
            mode="unknown_mode",
        )

    assert "answer" in result


async def test_search_returns_ranked_results(rag_service, mock_search_results, org_id):
    """Test search returns properly ranked results."""
    _, service = rag_service
    with patch.object(service, "search", AsyncMock(return_value=mock_search_results)):
        results = await service.search(
            organization_id=org_id,
            query="leave policy",
            top_k=5,
        )

    assert len(results) > 0
    for r in results:
        assert "text" in r
        assert "score" in r
        assert "filename" in r


async def test_search_with_department_filter(rag_service, org_id):
    """Test search with department filter."""
    _, service = rag_service
    with patch("app.services.rag_service.RAGProvider.search", AsyncMock(return_value=[])) as mock_search:
        await service.search(
            organization_id=org_id,
            query="policy",
            department_filter="HR",
            top_k=5,
        )

        # Verify the filter was passed to RAGProvider
        call_kwargs = mock_search.call_args[1]
        assert call_kwargs.get("filters") == {"department": "HR"}


async def test_index_documents_tracks_count(rag_service, org_id):
    """Test index_documents returns the correct count."""
    _, service = rag_service
    docs = [
        {"text": "Policy content 1.", "document_id": "doc-001", "filename": "policy1.pdf"},
        {"text": "Policy content 2.", "document_id": "doc-002", "filename": "policy2.pdf"},
    ]

    with patch("app.services.rag_service.RAGProvider.index_documents", AsyncMock(return_value=2)):
        with patch("app.services.rag_service.AnalyticsProvider.capture") as mock_capture:
            count = await service.index_documents(
                organization_id=org_id,
                documents=docs,
            )

            assert count == 2
            assert mock_capture.called


async def test_delete_document(rag_service, org_id):
    """Test delete_document delegates to RAGProvider."""
    _, service = rag_service
    with patch("app.services.rag_service.RAGProvider.delete_document_chunks", AsyncMock()) as mock_delete:
        await service.delete_document(
            organization_id=org_id,
            document_id="doc-001",
        )
        mock_delete.assert_called_once_with(org_id, "doc-001")
