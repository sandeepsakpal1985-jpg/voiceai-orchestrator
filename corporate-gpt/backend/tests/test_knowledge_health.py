"""
Tests for Knowledge Health Service
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy import select, func


@pytest.mark.asyncio
async def test_health_score_calculates_correctly(mock_db, org_id):
    """Test that health score is calculated correctly with different inputs."""
    from app.services.knowledge_health_service import KnowledgeHealthService
    
    service = KnowledgeHealthService(mock_db)
    
    # Mock count queries
    def scalar_side_effect(*args, **kwargs):
        result = AsyncMock()
        query_str = str(args[0] if args else "")
        if "is_indexed" in query_str or "indexed" in query_str.lower():
            result.scalar.return_value = 45
        elif "outdated" in query_str.lower() or "updated_at" in query_str.lower():
            result.scalar.return_value = 5
        elif "knowledge_gap" in query_str.lower() or "status" in query_str.lower():
            result.scalar.return_value = 3
        elif "low_confidence" in query_str.lower() or "analytics" in query_str.lower():
            result.scalar.return_value = 10
        else:
            result.scalar.return_value = 50
        return result
    
    mock_db.execute = AsyncMock(side_effect=scalar_side_effect)
    
    result = await service.get_health_score(org_id)
    
    assert "score" in result
    assert 0 <= result["score"] <= 100
    assert result["total_documents"] == 50
    assert result["indexed_documents"] == 45
    assert result["open_gaps"] == 3
    assert result["outdated_documents"] == 5


@pytest.mark.asyncio
async def test_health_score_zero_documents(mock_db, org_id):
    """Test health score when no documents exist."""
    from app.services.knowledge_health_service import KnowledgeHealthService
    
    service = KnowledgeHealthService(mock_db)
    
    def zero_scalar(*args, **kwargs):
        result = AsyncMock()
        result.scalar.return_value = 0
        return result
    
    mock_db.execute = AsyncMock(side_effect=zero_scalar)
    
    result = await service.get_health_score(org_id)
    
    assert result["score"] == 0
    assert result["total_documents"] == 0


@pytest.mark.asyncio
async def test_health_score_perfect(mock_db, org_id):
    """Test health score when everything is perfect."""
    from app.services.knowledge_health_service import KnowledgeHealthService
    
    service = KnowledgeHealthService(mock_db)
    
    def perfect_scalar(*args, **kwargs):
        result = AsyncMock()
        query_str = str(args[0] if args else "")
        if "is_indexed" in query_str:
            result.scalar.return_value = 100  # All indexed
        elif "outdated" in query_str.lower() or "updated_at" in query_str.lower():
            result.scalar.return_value = 0  # Nothing outdated
        elif "knowledge_gap" in query_str.lower() or "status" in query_str.lower():
            result.scalar.return_value = 0  # No gaps
        elif "low_confidence" in query_str.lower():
            result.scalar.return_value = 0  # No low confidence
        else:
            result.scalar.return_value = 100  # Total docs
        return result
    
    mock_db.execute = AsyncMock(side_effect=perfect_scalar)
    
    result = await service.get_health_score(org_id)
    
    assert result["score"] >= 95  # Should be near-perfect
    assert result["total_documents"] == 100


@pytest.mark.asyncio
async def test_gap_analysis_returns_top_gaps(mock_db, org_id):
    """Test gap analysis returns sorted gaps."""
    from app.services.knowledge_health_service import KnowledgeHealthService
    
    service = KnowledgeHealthService(mock_db)
    
    # Mock the execute to return gap data
    gap_rows = [
        MagicMock(query="How to process international payment?", frequency=15, department_id="FIN"),
        MagicMock(query="What is remote work policy?", frequency=12, department_id="HR"),
        MagicMock(query="How to request emergency access?", frequency=8, department_id="IT"),
    ]
    
    mock_result = AsyncMock()
    mock_result.all.return_value = gap_rows
    mock_db.execute.return_value = mock_result
    
    result = await service.get_gap_analysis(org_id)
    
    assert "total_gaps" in result
    assert "top_gaps" in result
    assert len(result["top_gaps"]) > 0


@pytest.mark.asyncio
async def test_record_gap_creates_new_gap(mock_db, org_id):
    """Test recording a new knowledge gap."""
    from app.services.knowledge_health_service import KnowledgeHealthService
    
    service = KnowledgeHealthService(mock_db)
    
    # Mock no existing gap
    mock_none = AsyncMock()
    mock_none.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_none
    
    await service.record_gap(org_id, "What is the travel policy?")
    
    # Verify add was called (new gap created)
    assert mock_db.add.called


@pytest.mark.asyncio
async def test_document_health_analyzes_outdated(mock_db, org_id):
    """Test document health analysis."""
    from app.services.knowledge_health_service import KnowledgeHealthService
    
    service = KnowledgeHealthService(mock_db)
    
    # Mock type distribution
    mock_type_result = AsyncMock()
    mock_type_result.all.return_value = [
        MagicMock(_data=("pdf", 30)),
        MagicMock(_data=("docx", 15)),
        MagicMock(_data=("xlsx", 5)),
    ]
    
    def doc_health_side_effect(*args, **kwargs):
        if "file_type" in str(args[0]):
            return mock_type_result
        result = AsyncMock()
        result.all.return_value = range(5)  # 5 outdated docs
        return result
    
    mock_db.execute = AsyncMock(side_effect=doc_health_side_effect)
    
    result = await service.get_document_health(org_id)
    
    assert "outdated_count" in result
    assert "by_type" in result
