"""Search endpoint tests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_search_no_auth(client: AsyncClient):
    resp = await client.get("/api/v1/search/?q=test")
    assert resp.status_code == 401
