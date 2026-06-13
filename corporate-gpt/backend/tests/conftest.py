"""
CorporateGPT Test Fixtures
"""
import asyncio
import pytest
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.fixture
def mock_db():
    """Create a mock async database session.
    Uses regular MagicMock for .scalars() to avoid coroutine attribute errors.
    """
    from unittest.mock import MagicMock
    db = AsyncMock()
    
    # Create a result mock where .scalars() is a regular callable (not async)
    scalar_result = MagicMock()
    scalar_result.all.return_value = []
    scalar_result.first.return_value = None
    scalar_result.one_or_none.return_value = None
    
    async_result = MagicMock()
    async_result.scalar.return_value = 10
    async_result.scalars.return_value = scalar_result
    async_result.all.return_value = []
    async_result.first.return_value = None
    
    db.execute.return_value = async_result
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    
    return db


@pytest.fixture
def org_id():
    """Default organization ID for tests."""
    return "test-org-001"


@pytest.fixture
def sample_document():
    """Sample document data."""
    return {
        "id": "doc-001",
        "organization_id": "test-org-001",
        "filename": "HR_Policy_2024.pdf",
        "title": "HR Policy 2024",
        "file_type": "pdf",
        "is_indexed": True,
        "page_count": 15,
        "char_count": 5000,
    }
