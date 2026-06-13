"""
Tests for Jira Connector
Tests connector methods and IntegrationSyncService Jira integration.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch



@pytest.fixture
def mock_jira_connector():
    """Create a JiraConnector with mocked client property (avoids slow atlassian import)."""
    from app.providers.connectors.jira import JiraConnector

    client = MagicMock()
    client.get_projects.return_value = [{"key": "KNOW", "name": "Knowledge Base"}]
    client.get_all_projects.return_value = [
        {"key": "KNOW", "name": "Knowledge Base", "description": "KB", "projectTypeKey": "business"},
        {"key": "HR", "name": "Human Resources", "description": "HR docs", "projectTypeKey": "business"},
    ]
    client.jql.return_value = {
        "issues": [
            {
                "id": "10001", "key": "KNOW-42",
                "fields": {
                    "summary": "Update leave policy",
                    "description": "The annual leave policy needs updating for 2024.",
                    "status": {"name": "In Progress"},
                    "issuetype": {"name": "Task"},
                    "priority": {"name": "High"},
                    "labels": ["HR", "policy"],
                    "assignee": {"displayName": "John Doe"},
                    "created": "2024-01-15T10:00:00.000+0000",
                    "updated": "2024-06-01T14:00:00.000+0000",
                },
            },
        ]
    }

    conn = JiraConnector(url="https://jira.company.com", username="bot@company.com", api_token="token-123")
    conn._client = client
    return conn


@pytest.fixture
def mock_jira_service(mock_db):
    """Create IntegrationSyncService with mock db for Jira tests."""
    from app.services.integration_sync_service import IntegrationSyncService
    return IntegrationSyncService(mock_db)


# ── Connector Tests ──


def test_jira_connector_init():
    """Test JiraConnector stores credentials and is lazy."""
    from app.providers.connectors.jira import JiraConnector
    conn = JiraConnector(url="https://jira.local", username="user", api_token="token")
    assert conn.url == "https://jira.local"
    assert conn.username == "user"
    assert conn.api_token == "token"
    assert conn._client is None


def test_test_connection_success(mock_jira_connector):
    """Test connection succeeds when Jira responds."""
    assert mock_jira_connector.test_connection() is True


def test_test_connection_failure(mock_jira_connector):
    """Test connection fails when Jira raises."""
    mock_jira_connector._client.get_projects.side_effect = Exception("Connection refused")
    assert mock_jira_connector.test_connection() is False


def test_list_projects(mock_jira_connector):
    """Test listing projects returns parsed project data."""
    projects = mock_jira_connector.list_projects()
    assert len(projects) == 2
    assert projects[0]["key"] == "KNOW"
    assert projects[1]["key"] == "HR"


def test_get_project_issues(mock_jira_connector):
    """Test getting issues from a project returns parsed issue data."""
    issues = mock_jira_connector.get_project_issues("KNOW")
    assert len(issues) == 1
    assert issues[0]["key"] == "KNOW-42"
    assert issues[0]["summary"] == "Update leave policy"
    assert issues[0]["status"] == "In Progress"
    assert issues[0]["issue_type"] == "Task"
    assert issues[0]["priority"] == "High"
    assert issues[0]["labels"] == ["HR", "policy"]
    assert issues[0]["assignee"] == "John Doe"


def test_sync_project(mock_jira_connector):
    """Test sync_project returns formatted issue data ready for indexing."""
    synced = mock_jira_connector.sync_project("KNOW")
    assert len(synced) == 1
    assert synced[0]["external_id"] == "KNOW-42"
    assert synced[0]["title"] == "[KNOW-42] Update leave policy"
    assert "annual leave" in synced[0]["content"]
    assert synced[0]["source"] == "jira"
    assert synced[0]["status"] == "In Progress"


def test_sync_project_with_callback(mock_jira_connector):
    """Test sync_project invokes callback for each issue."""
    callback = MagicMock()
    synced = mock_jira_connector.sync_project("KNOW", callback=callback)
    assert callback.called
    callback.assert_called_once_with(synced[0])


# ── Configure Tests ──


async def test_configure_jira_success(mock_jira_service, mock_db, org_id):
    """Test configuring a Jira integration successfully tests connection and saves."""
    with patch("app.services.integration_sync_service.JiraConnector") as mock_cls:
        mock_conn = MagicMock()
        mock_conn.test_connection.return_value = True
        mock_cls.return_value = mock_conn

        integration = await mock_jira_service.configure_jira(
            organization_id=org_id,
            name="Test Jira",
            url="https://jira.company.com",
            username="bot@company.com",
            api_token="token-123",
            project_key="KNOW",
        )

    assert integration.name == "Test Jira"
    assert integration.integration_type == "jira"
    assert integration.is_active is True
    assert integration.config["url"] == "https://jira.company.com"
    assert integration.config["project_key"] == "KNOW"
    assert mock_db.add.called
    mock_conn.test_connection.assert_called_once()


async def test_configure_jira_connection_failure(mock_jira_service, mock_db, org_id):
    """Test configure Jira raises when connection fails."""
    from app.services.integration_sync_service import IntegrationSyncError

    with patch("app.services.integration_sync_service.JiraConnector") as mock_cls:
        mock_conn = MagicMock()
        mock_conn.test_connection.return_value = False
        mock_cls.return_value = mock_conn

        with pytest.raises(IntegrationSyncError, match="Failed to connect to Jira"):
            await mock_jira_service.configure_jira(
                organization_id=org_id, name="Bad Jira",
                url="https://bad-url", username="user", api_token="token",
            )


# ── Sync Tests ──


async def test_trigger_jira_sync(mock_jira_service, mock_db, org_id):
    """Test triggering a Jira sync processes issues through the pipeline."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id, organization_id=org_id, name="Test Jira",
        integration_type="jira", is_active=True,
        config={"url": "https://jira.company.com", "username": "user", "api_token": "token", "project_key": "KNOW"},
    )

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    with patch.object(mock_jira_service, "_sync_jira", AsyncMock(return_value=3)):
        job = await mock_jira_service.trigger_sync(int_id, org_id)

    assert job.status == "completed"
    assert job.docs_processed == 3


async def test_trigger_jira_sync_all_projects(mock_jira_service, mock_db, org_id):
    """Test Jira sync with no project_key syncs all projects."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id, organization_id=org_id, name="All Projects",
        integration_type="jira", is_active=True,
        config={"url": "https://jira.company.com", "username": "user", "api_token": "token"},
    )

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    with patch.object(mock_jira_service, "_sync_jira", AsyncMock(return_value=5)):
        job = await mock_jira_service.trigger_sync(int_id, org_id)

    assert job.status == "completed"
    assert job.docs_processed == 5


async def test_jira_sync_handles_error(mock_jira_service, mock_db, org_id):
    """Test Jira sync marks job as failed when sync raises."""
    from app.models.integration import Integration

    int_id = str(uuid.uuid4())
    integration = Integration(
        id=int_id, organization_id=org_id, name="Failing Jira",
        integration_type="jira", is_active=True,
        config={"url": "https://jira.company.com", "username": "user", "api_token": "token", "project_key": "KNOW"},
    )

    mock_get_result = MagicMock()
    mock_get_result.scalar_one_or_none.return_value = integration
    mock_db.execute.return_value = mock_get_result

    with patch.object(mock_jira_service, "_sync_jira", side_effect=Exception("API rate limit exceeded")):
        job = await mock_jira_service.trigger_sync(int_id, org_id)

    assert job.status == "failed"
    assert "API rate limit exceeded" in job.error_log
