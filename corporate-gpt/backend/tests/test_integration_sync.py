"""
Tests for Integration Sync Service
Tests configure, sync, list, delete operations with mocked connectors and DB.
"""
import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_confluence_connector():
    """Create a mocked ConfluenceConnector."""
    with patch("app.services.integration_sync_service.ConfluenceConnector") as mock:
        instance = MagicMock()
        instance.test_connection.return_value = True
        instance.list_spaces.return_value = [
            {"key": "KNOW", "name": "Knowledge Base"},
            {"key": "HR", "name": "HR Documents"},
        ]
        instance.get_space_pages.return_value = [
            {
                "id": "12345",
                "title": "Employee Leave Policy",
                "version": {"number": 3},
            },
            {
                "id": "12346",
                "title": "Expense Policy 2024",
                "version": {"number": 2},
            },
        ]
        instance.get_page_content.return_value = "<p>Employees are entitled to 18 annual leave days.</p>"
        mock.return_value = instance
        yield instance


@pytest.fixture
def mock_sharepoint_connector():
    """Create a mocked SharePointConnector."""
    with patch("app.services.integration_sync_service.SharePointConnector") as mock:
        instance = MagicMock()
        instance.test_connection.return_value = True
        instance.list_document_libraries.return_value = [
            {"title": "HR Documents", "id": "lib-1", "item_count": 5},
            {"title": "Finance Reports", "id": "lib-2", "item_count": 3},
        ]
        instance.get_files.return_value = [
            {"name": "HR_Policy_2024.pdf", "url": "/sites/know/HR_Policy.pdf", "title": "HR Policy 2024"},
            {"name": "Onboarding_Checklist.docx", "url": "/sites/know/Onboarding.docx", "title": "Onboarding Checklist"},
        ]
        instance.download_file.return_value = "/tmp/test_file.pdf"
        mock.return_value = instance
        yield instance


@pytest.fixture
def mock_document_processor():
    """Mock the DocumentProcessor.extract_text method."""
    with patch("app.services.integration_sync_service.DocumentProcessor.extract_text") as mock:
        mock.return_value = {
            "text": "Sample extracted text content for testing purposes.",
            "tables": [],
            "metadata": {"char_count": 52, "page_count": 1},
            "elements": 1,
        }
        yield mock


@pytest.fixture
def mock_document_processing_provider():
    """Mock DocumentProcessingProvider.extract_text for Confluence HTML processing."""
    with patch("app.services.integration_sync_service.DocumentProcessingProvider.extract_text") as mock:
        mock.return_value = {
            "text": "Sample confluence page text content for testing.",
            "tables": [],
            "metadata": {"char_count": 50, "page_count": 1},
            "elements": 1,
        }
        yield mock


@pytest.fixture
def mock_chunking():
    """Mock chunk_text to return simple chunks."""
    with patch("app.services.integration_sync_service.chunk_text") as mock:
        mock.return_value = [
            {"text": "Chunk 1 text content.", "start_char": 0, "end_char": 20, "chunk_index": 0},
            {"text": "Chunk 2 text content.", "start_char": 21, "end_char": 40, "chunk_index": 1},
        ]
        yield mock


@pytest.fixture
def mock_embeddings():
    """Mock generate_embeddings."""
    with patch("app.services.integration_sync_service.generate_embeddings") as mock:
        mock.return_value = [[0.1] * 256, [0.2] * 256]
        yield mock


@pytest.fixture
def mock_vector():
    """Mock ensure_collection and upsert_document_chunks."""
    with patch("app.services.integration_sync_service.ensure_collection") as ensure:
        ensure.return_value = True
        with patch("app.services.integration_sync_service.upsert_document_chunks") as upsert:
            upsert.return_value = 2
            yield ensure, upsert


@pytest.fixture
def integration_sync_service(mock_db):
    """Create IntegrationSyncService with mock db."""
    from app.services.integration_sync_service import IntegrationSyncService
    return IntegrationSyncService(mock_db)


# ── Configure Tests ──


async def test_configure_confluence_success(
    integration_sync_service,
    mock_db,
    org_id,
    mock_confluence_connector,
):
    """Test configuring a Confluence integration successfully."""
    integration = await integration_sync_service.configure_confluence(
        organization_id=org_id,
        name="Test Confluence",
        url="https://company.atlassian.net/wiki",
        username="user@company.com",
        api_token="token-123",
        space_key="KNOW",
    )

    assert integration.name == "Test Confluence"
    assert integration.integration_type == "confluence"
    assert integration.is_active is True
    assert integration.config["url"] == "https://company.atlassian.net/wiki"
    assert integration.config["space_key"] == "KNOW"
    assert mock_db.add.called
    mock_confluence_connector.test_connection.assert_called_once()


async def test_configure_confluence_connection_failure(
    integration_sync_service,
    mock_db,
    org_id,
    mock_confluence_connector,
):
    """Test configure Confluence fails when connection fails."""
    mock_confluence_connector.test_connection.return_value = False

    from app.services.integration_sync_service import IntegrationSyncError

    with pytest.raises(IntegrationSyncError, match="Failed to connect to Confluence"):
        await integration_sync_service.configure_confluence(
            organization_id=org_id,
            name="Bad Confluence",
            url="https://bad-url",
            username="user",
            api_token="token",
        )


async def test_configure_sharepoint_success(
    integration_sync_service,
    mock_db,
    org_id,
    mock_sharepoint_connector,
):
    """Test configuring a SharePoint integration successfully."""
    integration = await integration_sync_service.configure_sharepoint(
        organization_id=org_id,
        name="Test SharePoint",
        site_url="https://company.sharepoint.com/sites/knowledge",
        client_id="client-123",
        client_secret="secret-456",
    )

    assert integration.name == "Test SharePoint"
    assert integration.integration_type == "sharepoint"
    assert integration.is_active is True
    assert integration.config["site_url"] == "https://company.sharepoint.com/sites/knowledge"
    assert mock_db.add.called
    mock_sharepoint_connector.test_connection.assert_called_once()


async def test_configure_sharepoint_connection_failure(
    integration_sync_service,
    mock_db,
    org_id,
    mock_sharepoint_connector,
):
    """Test configure SharePoint fails when connection fails."""
    mock_sharepoint_connector.test_connection.return_value = False

    from app.services.integration_sync_service import IntegrationSyncError

    with pytest.raises(IntegrationSyncError, match="Failed to connect to SharePoint"):
        await integration_sync_service.configure_sharepoint(
            organization_id=org_id,
            name="Bad SharePoint",
            site_url="https://bad-url",
            client_id="client",
            client_secret="secret",
        )


# ── List Tests ──


async def test_list_integrations(integration_sync_service, mock_db, org_id):
    """Test listing integrations returns active ones."""
    from app.models.integration import Integration

    # Mock DB to return some integrations
    mock_integrations = [
        Integration(
            id=str(uuid.uuid4()),
            organization_id=org_id,
            name="Confluence 1",
            integration_type="confluence",
            is_active=True,
            config={},
        ),
        Integration(
            id=str(uuid.uuid4()),
            organization_id=org_id,
            name="SharePoint 1",
            integration_type="sharepoint",
            is_active=True,
            config={},
        ),
    ]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = mock_integrations
    mock_db.execute.return_value = mock_result

    result = await integration_sync_service.list_integrations(org_id)

    assert len(result) == 2
    assert result[0].name == "Confluence 1"
    assert result[1].integration_type == "sharepoint"


# ── Get Tests ──


async def test_get_integration_found(integration_sync_service, mock_db, org_id):
    """Test getting a specific integration by ID."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    mock_integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="My Integration",
        integration_type="confluence",
        is_active=True,
        config={},
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_integration
    mock_db.execute.return_value = mock_result

    result = await integration_sync_service.get_integration(int_id, org_id)
    assert result.id == int_id
    assert result.name == "My Integration"


async def test_get_integration_not_found(integration_sync_service, mock_db, org_id):
    """Test getting a non-existent integration raises error."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    from app.services.integration_sync_service import IntegrationSyncError

    with pytest.raises(IntegrationSyncError, match="Integration not found"):
        await integration_sync_service.get_integration("non-existent", org_id)


# ── Delete Tests ──


async def test_delete_integration(integration_sync_service, mock_db, org_id):
    """Test deactivating an integration."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    mock_integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="To Delete",
        integration_type="confluence",
        is_active=True,
        config={},
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_integration
    mock_db.execute.return_value = mock_result

    await integration_sync_service.delete_integration(int_id, org_id)
    assert mock_integration.is_active is False


# ── Sync Tests (Confluence) ──


async def test_trigger_confluence_sync(
    integration_sync_service,
    mock_db,
    org_id,
    mock_confluence_connector,
    mock_document_processing_provider,
    mock_chunking,
    mock_embeddings,
    mock_vector,
):
    """Test triggering a Confluence sync processes pages through the pipeline."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="Test Confluence",
        integration_type="confluence",
        is_active=True,
        config={
            "url": "https://company.atlassian.net/wiki",
            "username": "user@company.com",
            "api_token": "token-123",
            "space_key": "KNOW",
        },
    )

    # Mock get_integration to return our test integration
    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    job = await integration_sync_service.trigger_sync(int_id, org_id)

    assert job.status == "completed"
    assert job.docs_processed > 0
    assert mock_confluence_connector.get_space_pages.called
    assert mock_confluence_connector.get_page_content.called
    mock_document_processing_provider.assert_called()


async def test_trigger_confluence_sync_all_spaces(
    integration_sync_service,
    mock_db,
    org_id,
    mock_confluence_connector,
    mock_document_processing_provider,
    mock_chunking,
    mock_embeddings,
    mock_vector,
):
    """Test Confluence sync with no space_key syncs all spaces."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="All Spaces",
        integration_type="confluence",
        is_active=True,
        config={
            "url": "https://company.atlassian.net/wiki",
            "username": "user@company.com",
            "api_token": "token-123",
            # No space_key = sync all
        },
    )

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    job = await integration_sync_service.trigger_sync(int_id, org_id)

    assert job.status == "completed"
    # Should have called get_space_pages for both KNOW and HR spaces
    assert mock_confluence_connector.list_spaces.called


async def test_confluence_sync_handles_empty_pages(
    integration_sync_service,
    mock_db,
    org_id,
    mock_confluence_connector,
    mock_document_processing_provider,
    mock_chunking,
    mock_embeddings,
    mock_vector,
):
    """Test Confluence sync handles pages with empty content gracefully."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="Empty Pages Test",
        integration_type="confluence",
        is_active=True,
        config={
            "url": "https://company.atlassian.net/wiki",
            "username": "user",
            "api_token": "token",
            "space_key": "EMPTY",
        },
    )

    # Return pages but with empty content
    mock_confluence_connector.get_space_pages.return_value = [
        {"id": "empty-1", "title": "Empty Page", "version": {"number": 1}},
    ]
    mock_confluence_connector.get_page_content.return_value = ""

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    job = await integration_sync_service.trigger_sync(int_id, org_id)

    assert job.status == "completed"
    assert job.docs_processed == 0  # No docs processed since content was empty


# ── Sync Tests (SharePoint) ──


async def test_trigger_sharepoint_sync(
    integration_sync_service,
    mock_db,
    org_id,
    mock_sharepoint_connector,
    mock_document_processor,
    mock_chunking,
    mock_embeddings,
    mock_vector,
):
    """Test triggering a SharePoint sync processes documents through the pipeline."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="Test SharePoint",
        integration_type="sharepoint",
        is_active=True,
        config={
            "site_url": "https://company.sharepoint.com/sites/knowledge",
            "client_id": "client-123",
            "client_secret": "secret-456",
        },
    )

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    job = await integration_sync_service.trigger_sync(int_id, org_id)

    assert job.status == "completed"
    assert job.docs_processed > 0
    assert mock_sharepoint_connector.list_document_libraries.called
    assert mock_sharepoint_connector.get_files.called
    mock_document_processor.assert_called()


async def test_sharepoint_sync_handles_sync_error(
    integration_sync_service,
    mock_db,
    org_id,
    mock_sharepoint_connector,
):
    """Test SharePoint sync handles errors gracefully and marks job as failed."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id,
        organization_id=org_id,
        name="Failing SharePoint",
        integration_type="sharepoint",
        is_active=True,
        config={
            "site_url": "https://company.sharepoint.com",
            "client_id": "client",
            "client_secret": "secret",
        },
    )

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    # Make list_document_libraries raise an error
    mock_sharepoint_connector.list_document_libraries.side_effect = Exception("Connection timeout")

    job = await integration_sync_service.trigger_sync(int_id, org_id)

    assert job.status == "failed"
    assert job.error_log is not None
    assert "Connection timeout" in job.error_log


# ── Sync History Tests ──


async def test_get_sync_history(integration_sync_service, mock_db, org_id):
    """Test retrieving sync history."""
    from app.models.integration import SyncJob

    int_id = str(uuid.uuid4())
    mock_jobs = [
        SyncJob(
            id=str(uuid.uuid4()),
            organization_id=org_id,
            integration_id=int_id,
            status="completed",
            docs_processed=10,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        ),
        SyncJob(
            id=str(uuid.uuid4()),
            organization_id=org_id,
            integration_id=int_id,
            status="failed",
            docs_processed=0,
            error_log="Some error",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        ),
    ]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = mock_jobs
    mock_db.execute.return_value = mock_result

    jobs = await integration_sync_service.get_sync_history(int_id, org_id, limit=10)

    assert len(jobs) == 2
    assert jobs[0].status == "completed"
    assert jobs[1].status == "failed"
