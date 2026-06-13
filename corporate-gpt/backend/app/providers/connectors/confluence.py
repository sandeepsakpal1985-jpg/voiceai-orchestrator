"""
Confluence Connector — atlassian-python-api wrapper
Syncs pages from Confluence spaces into the knowledge base.

Library: atlassian-python-api
"""
from typing import Any, Dict, List, Optional

from app.core.config import settings


class ConfluenceConnector:
    """Thin wrapper around atlassian-python-api for Confluence integration."""
    
    def __init__(self, url: str, username: str, api_token: str):
        self.url = url
        self.username = username
        self.api_token = api_token
        self._client = None
    
    @property
    def client(self):
        """Lazy-initialized Confluence client."""
        if self._client is None:
            from atlassian import Confluence
            self._client = Confluence(
                url=self.url,
                username=self.username,
                password=self.api_token,
            )
        return self._client
    
    def test_connection(self) -> bool:
        """Test the connection to Confluence."""
        try:
            self.client.get_spaces(limit=1)
            return True
        except Exception as e:
            print(f"Confluence connection failed: {e}")
            return False
    
    def list_spaces(self) -> List[Dict[str, Any]]:
        """List all accessible spaces."""
        spaces = self.client.get_all_spaces()
        return spaces.get("results", [])
    
    def get_space_pages(
        self,
        space_key: str,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get all pages from a Confluence space."""
        pages = []
        start = 0
        
        while True:
            batch = self.client.get_all_pages_from_space(
                space_key,
                start=start,
                limit=limit,
                expand="body.storage,version",
            )
            if not batch:
                break
            pages.extend(batch)
            start += limit
        
        return pages
    
    def get_page_content(self, page_id: str) -> str:
        """Get the HTML body of a Confluence page."""
        page = self.client.get_page_by_id(
            page_id,
            expand="body.storage",
        )
        return page.get("body", {}).get("storage", {}).get("value", "")
    
    def sync_space(
        self,
        space_key: str,
        callback=None,
    ) -> List[Dict[str, Any]]:
        """Sync all pages from a space. Calls callback(page_data) for each page."""
        pages = self.get_space_pages(space_key)
        synced = []
        
        for page in pages:
            content = self.get_page_content(page["id"])
            page_data = {
                "external_id": page["id"],
                "title": page["title"],
                "content": content,
                "url": f"{self.url}/spaces/{space_key}/pages/{page['id']}",
                "version": page.get("version", {}).get("number", 1),
                "space_key": space_key,
                "source": "confluence",
            }
            
            if callback:
                callback(page_data)
            
            synced.append(page_data)
        
        return synced
