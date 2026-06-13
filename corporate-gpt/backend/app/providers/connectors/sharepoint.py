"""
SharePoint Connector — Office365-REST-Python-Client wrapper
Syncs documents from SharePoint document libraries and OneDrive.

Library: Office365-REST-Python-Client
"""
from typing import Any, Callable, Dict, List, Optional

from app.core.config import settings


class SharePointConnector:
    """Thin wrapper around Office365-REST-Python-Client for SharePoint integration."""
    
    def __init__(
        self,
        site_url: str,
        client_id: str,
        client_secret: str,
        tenant: str = None,
    ):
        self.site_url = site_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.tenant = tenant
        self._client = None
    
    @property
    def client(self):
        """Lazy-initialized SharePoint client using app-only auth."""
        if self._client is None:
            from office365.sharepoint.client_context import ClientContext
            from office365.runtime.auth.client_credential import ClientCredential
            
            credentials = ClientCredential(self.client_id, self.client_secret)
            self._client = ClientContext(self.site_url).with_credentials(credentials)
        return self._client
    
    def test_connection(self) -> bool:
        """Test the connection to SharePoint."""
        try:
            self.client.web.get().execute_query()
            return True
        except Exception as e:
            print(f"SharePoint connection failed: {e}")
            return False
    
    def list_document_libraries(self) -> List[Dict[str, Any]]:
        """List all document libraries."""
        libraries = self.client.web.lists
        self.client.load(libraries)
        self.client.execute_query()
        
        return [
            {
                "id": lib.id,
                "title": lib.title,
                "item_count": lib.item_count,
            }
            for lib in libraries
            if lib.base_template == "documentLibrary"
        ]
    
    def get_files(
        self,
        library_title: str,
        folder_path: str = "",
        recursive: bool = True,
    ) -> List[Dict[str, Any]]:
        """Get files from a SharePoint document library."""
        library = self.client.web.lists.get_by_title(library_title)
        items = library.items
        self.client.load(items)
        self.client.execute_query()
        
        files = []
        for item in items:
            file_data = {
                "id": item.id,
                "title": item.properties.get("Title", ""),
                "name": item.properties.get("FileLeafRef", ""),
                "url": item.properties.get("FileRef", ""),
            }
            files.append(file_data)
        
        return files
    
    def download_file(self, file_url: str, local_path: str) -> str:
        """Download a file from SharePoint to local storage."""
        file = self.client.web.get_file_by_server_relative_url(file_url)
        self.client.load(file)
        self.client.execute_query()
        
        with open(local_path, "wb") as f:
            file.download(f)
            self.client.execute_query()
        
        return local_path
