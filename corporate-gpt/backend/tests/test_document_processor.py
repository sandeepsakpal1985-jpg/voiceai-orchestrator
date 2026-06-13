"""
Tests for Document Processing and Chunking Services
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = pytest.mark.asyncio


# ── Chunking Tests ──


def test_chunk_text_basic():
    """Test basic text chunking with default settings."""
    from app.services.chunking_service import chunk_text

    text = "A " * 500  # 1000 chars
    chunks = chunk_text(text, chunk_size=200, overlap=20)

    assert len(chunks) > 0
    for chunk in chunks:
        assert "text" in chunk
        assert "chunk_index" in chunk
        assert chunk["chunk_index"] >= 0


def test_chunk_text_overlap():
    """Test that chunks overlap correctly."""
    from app.services.chunking_service import chunk_text

    text = "Hello world. " * 100
    chunks = chunk_text(text, chunk_size=100, overlap=30)

    if len(chunks) > 1:
        # The end of chunk 0 should overlap with start of chunk 1
        assert chunks[0]["end_char"] > chunks[1]["start_char"]


def test_chunk_text_empty():
    """Test chunking empty text returns empty list."""
    from app.services.chunking_service import chunk_text

    chunks = chunk_text("")
    assert len(chunks) == 0


def test_chunk_text_whitespace_only():
    """Test chunking whitespace-only text returns empty list."""
    from app.services.chunking_service import chunk_text

    chunks = chunk_text("   \n\n  \t  ")
    assert len(chunks) == 0


def test_chunk_by_paragraph():
    """Test paragraph-based chunking."""
    from app.services.chunking_service import chunk_by_paragraph

    text = "\n\n".join([f"Paragraph {i} content here." for i in range(10)])
    chunks = chunk_by_paragraph(text, max_chars=100)

    assert len(chunks) > 0
    for chunk in chunks:
        assert "text" in chunk
        assert len(chunk["text"]) <= 100 + 50  # Allow some flexibility


# ── DocumentProcessor Tests ──


@pytest.fixture
def mock_provider_extract():
    """Mock DocumentProcessingProvider.extract_text."""
    with patch("app.services.document_processor.DocumentProcessingProvider.extract_text") as mock:
        mock.return_value = {
            "text": "Sample extracted text from document.",
            "tables": [],
            "metadata": {"char_count": 38, "page_count": 1},
            "elements": 3,
        }
        yield mock


async def test_document_processor_extract_text(mock_provider_extract):
    """Test DocumentProcessor.extract_text delegates to provider."""
    from app.services.document_processor import DocumentProcessor

    result = await DocumentProcessor.extract_text(
        file_path="/tmp/test.pdf",
        filename="test.pdf",
        ocr=True,
    )

    assert "text" in result
    assert result["text"] == "Sample extracted text from document."
    assert mock_provider_extract.called


async def test_document_processor_extract_and_chunk(mock_provider_extract):
    """Test DocumentProcessor.extract_and_chunk returns chunks."""
    from app.services.document_processor import DocumentProcessor

    chunks = await DocumentProcessor.extract_and_chunk(
        file_path="/tmp/test.pdf",
        filename="test.pdf",
        chunk_size=200,
        chunk_overlap=20,
    )

    assert len(chunks) > 0
    for chunk in chunks:
        assert "text" in chunk
        assert "chunk_index" in chunk
        assert "start_char" in chunk


async def test_document_processor_extract_and_chunk_empty_text():
    """Test extract_and_chunk handles empty text gracefully."""
    with patch("app.services.document_processor.DocumentProcessingProvider.extract_text") as mock:
        mock.return_value = {
            "text": "",
            "tables": [],
            "metadata": {"char_count": 0, "page_count": 0},
            "elements": 0,
        }
        from app.services.document_processor import DocumentProcessor

        chunks = await DocumentProcessor.extract_and_chunk(
            file_path="/tmp/empty.txt",
            filename="empty.txt",
        )

        assert len(chunks) == 0


def test_is_supported():
    """Test format support detection."""
    from app.services.document_processor import DocumentProcessor

    assert DocumentProcessor.is_supported("report.pdf")
    assert DocumentProcessor.is_supported("presentation.pptx")
    assert DocumentProcessor.is_supported("notes.txt")
    assert not DocumentProcessor.is_supported("script.exe")
    assert not DocumentProcessor.is_supported("archive.zip")
