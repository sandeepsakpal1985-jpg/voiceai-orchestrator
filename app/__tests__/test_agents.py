"""Tests for the Agent Management router."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestAgentRouter:
    """Test suite for /agents endpoints."""

    AGENT_PAYLOAD = {
        "name": "Test Agent",
        "description": "A test agent",
        "system_prompt": "You are a test assistant.",
        "stt_provider": "whisper",
        "llm_provider": "openai",
        "tts_provider": "elevenlabs",
    }

    def _create_agent(self, client):
        """Helper to create an agent and return its ID."""
        resp = client.post("/agents", json=self.AGENT_PAYLOAD)
        assert resp.status_code == 201
        data = resp.json()
        assert data["agent"]["name"] == "Test Agent"
        assert data["agent"]["is_active"] is True
        assert "id" in data["agent"]
        return data["agent"]["id"]

    def test_create_agent(self, client):
        agent_id = self._create_agent(client)
        assert agent_id is not None

    def test_list_agents(self, client):
        # Create one agent first
        self._create_agent(client)

        resp = client.get("/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert "agents" in data
        assert data["total"] >= 1

    def test_get_agent(self, client):
        agent_id = self._create_agent(client)

        resp = client.get(f"/agents/{agent_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent"]["id"] == agent_id
        assert data["agent"]["name"] == "Test Agent"

    def test_get_agent_not_found(self, client):
        resp = client.get("/agents/nonexistent")
        assert resp.status_code == 404

    def test_update_agent(self, client):
        agent_id = self._create_agent(client)

        resp = client.put(f"/agents/{agent_id}", json={"name": "Updated Agent", "language": "es-ES"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent"]["name"] == "Updated Agent"
        assert data["agent"]["language"] == "es-ES"
        # Previous values should be preserved
        assert data["agent"]["stt_provider"] == "whisper"

    def test_delete_agent(self, client):
        agent_id = self._create_agent(client)

        resp = client.delete(f"/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify it's gone
        resp = client.get(f"/agents/{agent_id}")
        assert resp.status_code == 404

    def test_activate_deactivate(self, client):
        agent_id = self._create_agent(client)

        resp = client.post(f"/agents/{agent_id}/deactivate")
        assert resp.status_code == 200
        assert resp.json()["agent"]["is_active"] is False

        resp = client.post(f"/agents/{agent_id}/activate")
        assert resp.status_code == 200
        assert resp.json()["agent"]["is_active"] is True

    def test_agent_tools(self, client):
        agent_id = self._create_agent(client)

        # Add a tool
        tool_payload = {"name": "WebSearch", "type": "function", "endpoint": "https://api.search.com"}
        resp = client.post(f"/agents/{agent_id}/tools", json=tool_payload)
        assert resp.status_code == 201
        assert resp.json()["tool"]["name"] == "WebSearch"

        # List tools
        resp = client.get(f"/agents/{agent_id}/tools")
        assert resp.status_code == 200
        assert len(resp.json()["tools"]) == 1

        # Delete tool
        tool_id = resp.json()["tools"][0]["id"]
        resp = client.delete(f"/agents/{agent_id}/tools/{tool_id}")
        assert resp.status_code == 200

        # Verify empty
        resp = client.get(f"/agents/{agent_id}/tools")
        assert len(resp.json()["tools"]) == 0

    def test_agent_social_accounts(self, client):
        agent_id = self._create_agent(client)

        # Connect social account
        social_payload = {"platform": "instagram", "account_id": "test_user", "account_name": "Test User"}
        resp = client.post(f"/agents/{agent_id}/social", json=social_payload)
        assert resp.status_code == 201
        assert resp.json()["social_account"]["platform"] == "instagram"

        # List social accounts
        resp = client.get(f"/agents/{agent_id}/social")
        assert resp.status_code == 200
        assert len(resp.json()["social_accounts"]) == 1

        # Disconnect
        social_id = resp.json()["social_accounts"][0]["id"]
        resp = client.delete(f"/agents/{agent_id}/social/{social_id}")
        assert resp.status_code == 200

        # Verify empty
        resp = client.get(f"/agents/{agent_id}/social")
        assert len(resp.json()["social_accounts"]) == 0
