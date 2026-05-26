"""Tests for the Social Automation router."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.social import _connections, _messages, _auto_reply_configs


@pytest.fixture(autouse=True)
def cleanup_social_state():
    """Reset in-memory social state before each test."""
    _connections.clear()
    _messages.clear()
    _auto_reply_configs.clear()
    yield


@pytest.fixture
def client():
    return TestClient(app)


class TestSocialRouter:
    """Test suite for /social endpoints."""

    CONNECTION_PAYLOAD = {
        "platform": "instagram",
        "account_id": "test_user_123",
        "account_name": "Test User",
        "auto_reply": True,
        "welcome_message": "Hello! Thanks for reaching out.",
    }

    def _create_connection(self, client, platform="instagram", account_id="test_user_123"):
        payload = {**self.CONNECTION_PAYLOAD, "platform": platform, "account_id": account_id}
        resp = client.post("/social/connections", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["connection"]["platform"] == platform
        assert data["connection"]["status"] == "connected"
        assert "id" in data["connection"]
        return data["connection"]["id"]

    def test_list_platforms(self, client):
        resp = client.get("/social/platforms")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["platforms"]) == 3
        platforms = {p["id"] for p in data["platforms"]}
        assert platforms == {"instagram", "facebook", "whatsapp"}

    def test_list_connections_empty(self, client):
        resp = client.get("/social/connections")
        assert resp.status_code == 200
        assert resp.json()["connections"] == []

    def test_create_connection(self, client):
        conn_id = self._create_connection(client)
        assert conn_id is not None

    def test_list_connections(self, client):
        self._create_connection(client)

        resp = client.get("/social/connections")
        assert resp.status_code == 200
        assert len(resp.json()["connections"]) >= 1

    def test_get_connection(self, client):
        conn_id = self._create_connection(client)

        resp = client.get(f"/social/connections/{conn_id}")
        assert resp.status_code == 200
        assert resp.json()["connection"]["id"] == conn_id

    def test_get_connection_not_found(self, client):
        resp = client.get("/social/connections/nonexistent")
        assert resp.status_code == 404

    def test_update_connection(self, client):
        conn_id = self._create_connection(client)

        resp = client.put(
            f"/social/connections/{conn_id}",
            json={"account_name": "Updated Name"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["connection"]["account_name"] == "Updated Name"

    def test_delete_connection(self, client):
        conn_id = self._create_connection(client)

        resp = client.delete(f"/social/connections/{conn_id}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify it's gone
        resp = client.get(f"/social/connections/{conn_id}")
        assert resp.status_code == 404

    def test_auto_reply_config(self, client):
        conn_id = self._create_connection(client)

        # Get default config
        resp = client.get(f"/social/connections/{conn_id}/auto-reply")
        assert resp.status_code == 200
        assert "auto_reply" in resp.json()

        # Update config
        config = {
            "enabled": True,
            "welcome_message": "Welcome! How can I help you today?",
            "keywords": ["help", "support", "pricing"],
            "ai_response": True,
            "crm_sync": True,
        }
        resp = client.put(f"/social/connections/{conn_id}/auto-reply", json=config)
        assert resp.status_code == 200
        data = resp.json()
        assert data["auto_reply"]["enabled"] is True
        assert "help" in data["auto_reply"]["keywords"]

    def test_send_message(self, client):
        conn_id = self._create_connection(client)

        resp = client.post(
            f"/social/connections/{conn_id}/messages",
            json={"content": "Hello from the API test!", "recipient_id": "user_456"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["message"]["direction"] == "outgoing"
        assert data["message"]["status"] == "sent"

    def test_list_messages(self, client):
        conn_id = self._create_connection(client)

        # Send a message first
        client.post(
            f"/social/connections/{conn_id}/messages",
            json={"content": "Test message", "recipient_id": "user_456"},
        )

        resp = client.get(f"/social/connections/{conn_id}/messages")
        assert resp.status_code == 200
        assert len(resp.json()["messages"]) >= 1

    def test_sync_connection(self, client):
        conn_id = self._create_connection(client)

        resp = client.post(f"/social/sync/{conn_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["last_sync_at"] is not None

    def test_filter_by_platform(self, client):
        # Create an Instagram connection
        self._create_connection(client, platform="instagram", account_id="test_ig")

        resp = client.get("/social/connections?platform=instagram")
        assert resp.status_code == 200
        assert len(resp.json()["connections"]) == 1

        resp = client.get("/social/connections?platform=facebook")
        assert resp.status_code == 200
        assert len(resp.json()["connections"]) == 0
