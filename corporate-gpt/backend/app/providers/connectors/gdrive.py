"""
Google Drive Connector — google-api-python-client wrapper
Syncs documents from Google Drive into the knowledge base.

Library: google-api-python-client, google-auth-httplib2, google-auth-oauthlib
"""
import io
import os
import re
import tempfile
from typing import Any, Callable, Dict, List, Optional


class GoogleDriveConnector:
    """Thin wrapper around google-api-python-client for Google Drive integration."""

    def __init__(self, service_account_json: str, folder_id: Optional[str] = None):
        self.service_account_json = service_account_json
        self.folder_id = folder_id
        self._service = None

    @property
    def service(self):
        """Lazy-initialized Google Drive service."""
        if self._service is None:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            import json
            creds = service_account.Credentials.from_service_account_info(
                json.loads(self.service_account_json),
                scopes=["https://www.googleapis.com/auth/drive.readonly"],
            )
            self._service = build("drive", "v3", credentials=creds)
        return self._service

    def test_connection(self) -> bool:
        """Test the connection to Google Drive."""
        try:
            self.service.files().list(pageSize=1).execute()
            return True
        except Exception as e:
            print(f"Google Drive connection failed: {e}")
            return False

    def list_files(
        self,
        folder_id: Optional[str] = None,
        mime_types: Optional[List[str]] = None,
        page_size: int = 100,
    ) -> List[Dict[str, Any]]:
        """List files in a Google Drive folder.

        Args:
            folder_id: Drive folder ID. Falls back to self.folder_id or root.
            mime_types: Filter by MIME types (default: documents, sheets, PDFs, text).
            page_size: Max results per page.

        Returns:
            List of file dicts with id, name, mimeType, size, modifiedTime, etc.
        """
        if mime_types is None:
            mime_types = [
                "application/vnd.google-apps.document",
                "application/vnd.google-apps.spreadsheet",
                "application/pdf",
                "text/plain",
                "text/csv",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ]

        query_parts = []
        if folder_id or self.folder_id:
            query_parts.append(f"'{folder_id or self.folder_id}' in parents")
        if mime_types:
            mime_filter = " or ".join(f"mimeType='{m}'" for m in mime_types)
            query_parts.append(f"({mime_filter})")

        q = " and ".join(query_parts) if query_parts else None

        all_files = []
        page_token = None

        while True:
            request = self.service.files().list(
                q=q,
                pageSize=page_size,
                pageToken=page_token,
                fields="files(id, name, mimeType, size, modifiedTime, webViewLink, description), nextPageToken",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            response = request.execute()
            items = response.get("files", [])

            for item in items:
                all_files.append({
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "mime_type": item.get("mimeType"),
                    "size": int(item.get("size", 0)) if item.get("size") else 0,
                    "modified_time": item.get("modifiedTime", ""),
                    "web_view_link": item.get("webViewLink", ""),
                    "description": item.get("description", ""),
                })

            page_token = response.get("nextPageToken")
            if not page_token:
                break

        return all_files

    def download_file(self, file_id: str, file_name: str, mime_type: str) -> str:
        """Download a file from Google Drive to a local temp file.

        For Google-native formats (Docs, Sheets), exports to a downloadable format.

        Returns:
            Path to the downloaded temp file.
        """
        ext = self._get_extension(file_name, mime_type)
        tmp_path = tempfile.mktemp(suffix=ext)

        try:
            if mime_type == "application/vnd.google-apps.document":
                # Export Google Doc as plain text
                request = self.service.files().export(
                    fileId=file_id, mimeType="text/plain"
                )
                content = request.execute()
                with open(tmp_path, "wb") as f:
                    f.write(content)

            elif mime_type == "application/vnd.google-apps.spreadsheet":
                # Export Google Sheet as CSV
                request = self.service.files().export(
                    fileId=file_id, mimeType="text/csv"
                )
                content = request.execute()
                with open(tmp_path, "wb") as f:
                    f.write(content)

            elif mime_type == "application/vnd.google-apps.presentation":
                # Export Google Slides as plain text
                request = self.service.files().export(
                    fileId=file_id, mimeType="text/plain"
                )
                content = request.execute()
                with open(tmp_path, "wb") as f:
                    f.write(content)

            else:
                # Download binary file
                request = self.service.files().get_media(fileId=file_id)
                with open(tmp_path, "wb") as f:
                    downloader = None
                    try:
                        from googleapiclient.http import MediaIoBaseDownload
                        downloader = MediaIoBaseDownload(f, request)
                        done = False
                        while not done:
                            _, done = downloader.next_chunk()
                    except ImportError:
                        # Fallback: direct download
                        content = request.execute()
                        f.write(content)

        except Exception as e:
            # Clean up on failure
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            raise e

        return tmp_path

    def export_text(self, file_id: str, mime_type: str) -> str:
        """Export a Google-native file as plain text without saving to disk.

        Useful for Google Docs, Sheets, and Slides where we just need the text.
        """
        if mime_type in (
            "application/vnd.google-apps.document",
            "application/vnd.google-apps.presentation",
        ):
            content = self.service.files().export(
                fileId=file_id, mimeType="text/plain"
            ).execute()
            return content.decode("utf-8") if isinstance(content, bytes) else content

        elif mime_type == "application/vnd.google-apps.spreadsheet":
            content = self.service.files().export(
                fileId=file_id, mimeType="text/csv"
            ).execute()
            return content.decode("utf-8") if isinstance(content, bytes) else content

        return ""

    def sync_folder(
        self,
        folder_id: Optional[str] = None,
        callback: Optional[Callable] = None,
    ) -> List[Dict[str, Any]]:
        """Sync all files from a Drive folder. Calls callback(file_data) for each file.

        Args:
            folder_id: Drive folder ID. If None, syncs from root.
            callback: Optional function to call with each file's data.

        Returns:
            List of synced file data dicts.
        """
        files = self.list_files(folder_id=folder_id or self.folder_id)
        synced = []

        for f in files:
            try:
                text = self.export_text(f["id"], f["mime_type"]) if f["mime_type"].startswith(
                    "application/vnd.google-apps."
                ) else ""

                file_data = {
                    "external_id": f["id"],
                    "title": f["name"],
                    "content": text or f.get("description", ""),
                    "url": f.get("web_view_link", ""),
                    "mime_type": f["mime_type"],
                    "file_size": f["size"],
                    "modified_time": f["modified_time"],
                    "source": "gdrive",
                }

                if callback:
                    callback(file_data)

                synced.append(file_data)

            except Exception as e:
                print(f"Failed to sync GDrive file {f.get('name')}: {e}")
                continue

        return synced

    @staticmethod
    def _get_extension(filename: str, mime_type: str) -> str:
        """Get file extension from filename or MIME type."""
        _, ext = os.path.splitext(filename)
        if ext:
            return ext

        mime_map = {
            "application/pdf": ".pdf",
            "text/plain": ".txt",
            "text/csv": ".csv",
            "application/vnd.google-apps.document": ".txt",
            "application/vnd.google-apps.spreadsheet": ".csv",
            "application/vnd.google-apps.presentation": ".txt",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        }
        return mime_map.get(mime_type, ".bin")
