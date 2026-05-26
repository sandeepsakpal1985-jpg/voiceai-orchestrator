"""Tests for the Knowledge Base / RAG router."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestKnowledgeRouter:
    """Test suite for /knowledge endpoints."""

    def test_list_documents_empty(self, client):
        resp = client.get("/knowledge")
        assert resp.status_code == 200
        data = resp.json()
        assert data["documents"] == []
        assert data["total"] == 0

    def test_upload_document(self, client):
        resp = client.post(
            "/knowledge/upload",
            files={"file": ("test.txt", b"Hello, this is test content for indexing!", "text/plain")},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["document"]["name"] == "test.txt"
        assert data["document"]["status"] in ("indexed", "processing", "failed")
        assert "id" in data["document"]

    def test_index_text(self, client):
        resp = client.post(
            "/knowledge/index",
            json={"content": "This is some test knowledge content that should be indexed into the vector database for semantic search.", "tags": ["test", "manual"]},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["document"]["file_type"] == "text"
        assert "id" in data["document"]

    def test_list_documents_after_upload(self, client):
        self.test_upload_document(client)
        self.test_index_text(client)

        resp = client.get("/knowledge")
        assert resp.status_code == 200
        assert resp.json()["total"] >= 2

    def test_get_document(self, client):
        # Upload a doc first
        resp = client.post(
            "/knowledge/upload",
            files={"file": ("doc1.txt", b"Document content", "text/plain")},
        )
        doc_id = resp.json()["document"]["id"]

        resp = client.get(f"/knowledge/{doc_id}")
        assert resp.status_code == 200
        assert resp.json()["document"]["id"] == doc_id

    def test_get_document_not_found(self, client):
        resp = client.get("/knowledge/nonexistent")
        assert resp.status_code == 404

    def test_search_knowledge(self, client):
        # Upload some content first
        client.post(
            "/knowledge/upload",
            files={"file": ("search_test.txt", b"Artificial intelligence and machine learning are transforming how we interact with technology.", "text/plain")},
        )

        resp = client.post("/knowledge/search", json={"query": "AI technology", "top_k": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["query"] == "AI technology"
        assert "results" in data

    def test_build_context(self, client):
        resp = client.post(
            "/knowledge/index",
            json={"content": "Python is a versatile programming language used in AI and web development.", "tags": ["programming"]},
        )

        resp = client.post("/knowledge/context?query=Python programming")
        assert resp.status_code == 200
        data = resp.json()
        assert "context" in data

    def test_rag_status(self, client):
        resp = client.get("/knowledge/rag/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "available" in data
        assert "collection" in data

    def test_delete_document(self, client):
        # Upload a doc first
        resp = client.post(
            "/knowledge/upload",
            files={"file": ("delete_me.txt", b"Delete this content", "text/plain")},
        )
        doc_id = resp.json()["document"]["id"]

        resp = client.delete(f"/knowledge/{doc_id}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # Verify it's gone
        resp = client.get(f"/knowledge/{doc_id}")
        assert resp.status_code == 404

    def test_reindex_document(self, client):
        resp = client.post(
            "/knowledge/upload",
            files={"file": ("reindex.txt", b"Content to re-index multiple times", "text/plain")},
        )
        doc_id = resp.json()["document"]["id"]

        resp = client.post(f"/knowledge/{doc_id}/reindex")
        assert resp.status_code == 200
        data = resp.json()
        assert data["document"]["id"] == doc_id

    def test_filter_documents_by_status(self, client):
        resp = client.get("/knowledge?status=indexed")
        assert resp.status_code == 200
        assert "documents" in resp.json()
