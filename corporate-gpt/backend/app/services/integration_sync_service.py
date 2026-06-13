"""
Integration Sync Service — Orchestrates external connector syncs through the document pipeline.

Flow:
1. Connector connects to external service (Confluence, SharePoint, Jira)
2. Downloads/fetches pages/files/issues
3. Processes each through DocumentProcessor → Chunking → Embeddings → Qdrant indexing
4. Creates Document records in the database
5. Creates SyncJob record to track progress
"""
import uuid
import os
import logging
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document import Document
from app.models.integration import Integration, SyncJob
from app.services.document_processor import DocumentProcessor
from app.services.vector_service import ensure_collection, upsert_document_chunks
from app.services.embedding_service import generate_embeddings
from app.services.chunking_service import chunk_text
from app.providers.connectors.confluence import ConfluenceConnector
from app.providers.connectors.sharepoint import SharePointConnector
from app.providers.connectors.jira import JiraConnector
from app.providers.connectors.gdrive import GoogleDriveConnector
from app.providers.document_processing import DocumentProcessingProvider

logger = logging.getLogger("corpgpt.integration_sync")


class IntegrationSyncError(Exception):
    """Raised when integration sync fails."""
    pass


class IntegrationSyncService:
    """Orchestrates syncing external content through the document pipeline."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Configuration ──────────────────────────────────────────────

    async def configure_confluence(
        self,
        organization_id: str,
        name: str,
        url: str,
        username: str,
        api_token: str,
        space_key: Optional[str] = None,
    ) -> Integration:
        """Configure a new Confluence integration and test the connection."""
        connector = ConfluenceConnector(url=url, username=username, api_token=api_token)
        if not connector.test_connection():
            raise IntegrationSyncError("Failed to connect to Confluence. Check URL, username, and API token.")
        integration = Integration(
            id=str(uuid.uuid4()), organization_id=organization_id, name=name,
            integration_type="confluence",
            config={"url": url, "username": username, "api_token": api_token, "space_key": space_key},
            is_active=True,
        )
        self.db.add(integration)
        await self.db.flush()
        logger.info("Confluence integration configured: %s (%s)", name, url)
        return integration

    async def configure_sharepoint(
        self,
        organization_id: str,
        name: str,
        site_url: str,
        client_id: str,
        client_secret: str,
    ) -> Integration:
        """Configure a new SharePoint integration and test the connection."""
        connector = SharePointConnector(site_url=site_url, client_id=client_id, client_secret=client_secret)
        if not connector.test_connection():
            raise IntegrationSyncError("Failed to connect to SharePoint. Check URL and credentials.")
        integration = Integration(
            id=str(uuid.uuid4()), organization_id=organization_id, name=name,
            integration_type="sharepoint",
            config={"site_url": site_url, "client_id": client_id, "client_secret": client_secret},
            is_active=True,
        )
        self.db.add(integration)
        await self.db.flush()
        logger.info("SharePoint integration configured: %s (%s)", name, site_url)
        return integration

    async def configure_jira(
        self,
        organization_id: str,
        name: str,
        url: str,
        username: str,
        api_token: str,
        project_key: Optional[str] = None,
    ) -> Integration:
        """Configure a new Jira integration and test the connection."""
        connector = JiraConnector(url=url, username=username, api_token=api_token)
        if not connector.test_connection():
            raise IntegrationSyncError("Failed to connect to Jira. Check URL, username, and API token.")
        integration = Integration(
            id=str(uuid.uuid4()), organization_id=organization_id, name=name,
            integration_type="jira",
            config={"url": url, "username": username, "api_token": api_token, "project_key": project_key},
            is_active=True,
        )
        self.db.add(integration)
        await self.db.flush()
        logger.info("Jira integration configured: %s (%s)", name, url)
        return integration

    # ── CRUD ──────────────────────────────────────────────────────

    async def list_integrations(self, organization_id: str) -> List[Integration]:
        """List all integrations for an organization."""
        result = await self.db.execute(
            select(Integration).where(
                Integration.organization_id == organization_id, Integration.is_active == True,
            ).order_by(Integration.created_at.desc())
        )
        return result.scalars().all()

    async def get_integration(self, integration_id: str, organization_id: str) -> Integration:
        """Get a single integration by ID."""
        result = await self.db.execute(
            select(Integration).where(Integration.id == integration_id, Integration.organization_id == organization_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            raise IntegrationSyncError("Integration not found")
        return integration

    async def delete_integration(self, integration_id: str, organization_id: str):
        """Deactivate an integration."""
        integration = await self.get_integration(integration_id, organization_id)
        integration.is_active = False
        logger.info("Integration deactivated: %s", integration_id)

    # ── Sync ──────────────────────────────────────────────────────

    async def trigger_sync(self, integration_id: str, organization_id: str) -> SyncJob:
        """Trigger a sync for an integration. Creates a sync job and runs the sync."""
        integration = await self.get_integration(integration_id, organization_id)
        job = SyncJob(
            id=str(uuid.uuid4()), organization_id=organization_id, integration_id=integration_id,
            status="running", sync_type="full", started_at=datetime.now(timezone.utc),
        )
        self.db.add(job)
        await self.db.flush()
        try:
            if integration.integration_type == "confluence":
                docs_processed = await self._sync_confluence(integration, organization_id)
            elif integration.integration_type == "sharepoint":
                docs_processed = await self._sync_sharepoint(integration, organization_id)
            elif integration.integration_type == "jira":
                docs_processed = await self._sync_jira(integration, organization_id)
            elif integration.integration_type == "gdrive":
                docs_processed = await self._sync_gdrive(integration, organization_id)
            else:
                raise IntegrationSyncError(f"Unknown integration type: {integration.integration_type}")
            job.status = "completed"
            job.docs_processed = docs_processed
            job.completed_at = datetime.now(timezone.utc)
            integration.last_sync_at = datetime.now(timezone.utc)
            logger.info("Sync completed: %d docs from %s", docs_processed, integration.integration_type)
        except Exception as e:
            job.status = "failed"
            job.error_log = str(e)[:1000]
            job.completed_at = datetime.now(timezone.utc)
            logger.error("Sync failed for integration %s: %s", integration_id, e)
        await self.db.flush()
        return job

    async def get_sync_history(self, integration_id: str, organization_id: str, limit: int = 10) -> List[SyncJob]:
        """Get sync history for an integration."""
        result = await self.db.execute(
            select(SyncJob).where(
                SyncJob.integration_id == integration_id, SyncJob.organization_id == organization_id,
            ).order_by(SyncJob.created_at.desc()).limit(limit)
        )
        return result.scalars().all()

    # ── Shared Helper: Index Content ──────────────────────────────

    async def _index_content(
        self,
        organization_id: str,
        title: str,
        raw_text: str,
        filename: str,
        original_filename: str,
        file_type: str,
        storage_path: str,
        category: str,
        tags: Optional[List[str]] = None,
    ) -> bool:
        """Chunk, embed, and index a piece of content.

        Returns True if the content was successfully indexed, False if skipped.
        """
        chunks = chunk_text(raw_text)
        if not chunks:
            return False

        doc_id = str(uuid.uuid4())
        doc = Document(
            id=doc_id, organization_id=organization_id,
            filename=filename, original_filename=original_filename,
            file_type=file_type, file_size=len(raw_text),
            storage_path=storage_path, title=title,
            category=category, tags=tags or [],
            chunk_count=len(chunks), is_indexed=False,
        )
        self.db.add(doc)
        await self.db.flush()

        await ensure_collection(organization_id)
        embeddings = await generate_embeddings([c["text"] for c in chunks])
        await upsert_document_chunks(doc_id, organization_id, title, chunks, embeddings)
        doc.is_indexed = True
        return True

    # ── Confluence Sync ───────────────────────────────────────────

    async def _sync_confluence(self, integration: Integration, organization_id: str) -> int:
        """Sync all pages from a Confluence space through the document pipeline."""
        config = integration.config
        connector = ConfluenceConnector(url=config["url"], username=config["username"], api_token=config["api_token"])
        space_key = config.get("space_key")
        if not space_key:
            spaces = connector.list_spaces()
            total = 0
            for space in spaces:
                total += await self._process_confluence_pages(connector, space["key"], organization_id)
            return total
        return await self._process_confluence_pages(connector, space_key, organization_id)

    async def _process_confluence_pages(self, connector: ConfluenceConnector, space_key: str, organization_id: str) -> int:
        """Fetch and process all pages in a Confluence space."""
        raw_pages = connector.get_space_pages(space_key)
        docs_processed = 0
        for page_data in raw_pages:
            try:
                page_id = page_data["id"]
                title = page_data.get("title", "Untitled")
                html_content = connector.get_page_content(page_id)
                if not html_content.strip():
                    continue

                with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as f:
                    f.write(html_content)
                    html_path = f.name
                try:
                    result = await DocumentProcessingProvider.extract_text(
                        file_path=html_path, filename=f"{title}.html", ocr=False,
                    )
                    raw_text = result.get("text", "")
                finally:
                    try:
                        os.unlink(html_path)
                    except Exception:
                        pass

                if not raw_text.strip():
                    continue

                ok = await self._index_content(
                    organization_id=organization_id, title=title, raw_text=raw_text,
                    filename=f"confluence_{space_key}_{page_id}", original_filename=f"{title}.html",
                    file_type="html", storage_path=f"confluence://{space_key}/{page_id}",
                    category="confluence", tags=["confluence", space_key],
                )
                if ok:
                    docs_processed += 1

            except Exception as e:
                logger.error("Failed to process Confluence page %s: %s", page_data.get("id"), e)
                continue
        return docs_processed

    # ── SharePoint Sync ───────────────────────────────────────────

    async def _sync_sharepoint(self, integration: Integration, organization_id: str) -> int:
        """Sync files from SharePoint document libraries through the document pipeline."""
        config = integration.config
        connector = SharePointConnector(
            site_url=config["site_url"], client_id=config["client_id"], client_secret=config["client_secret"],
        )
        libraries = connector.list_document_libraries()
        docs_processed = 0
        for lib in libraries:
            try:
                files = connector.get_files(lib["title"])
                for file_info in files:
                    try:
                        file_name = file_info.get("name", "")
                        file_url = file_info.get("url", "")
                        if not file_name or not file_url:
                            continue

                        ext = os.path.splitext(file_name)[1].lower()
                        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                            local_path = connector.download_file(file_url, tmp.name)
                            tmp_path = tmp.name if not local_path else local_path
                        try:
                            result = await DocumentProcessor.extract_text(
                                file_path=tmp_path, filename=file_name, ocr=True,
                            )
                            raw_text = result.get("text", "")
                        finally:
                            try:
                                os.unlink(tmp_path)
                            except Exception:
                                pass

                        if not raw_text.strip():
                            continue

                        ok = await self._index_content(
                            organization_id=organization_id,
                            title=file_info.get("title") or file_name, raw_text=raw_text,
                            filename=file_name, original_filename=file_name,
                            file_type=ext[1:] if ext else "unknown",
                            storage_path=file_url, category="sharepoint",
                            tags=["sharepoint", lib.get("title", "")],
                        )
                        if ok:
                            docs_processed += 1

                    except Exception as e:
                        logger.error("Failed to process SharePoint file %s: %s", file_info.get("name"), e)
                        continue
            except Exception as e:
                logger.error("Failed to process SharePoint library %s: %s", lib.get("title"), e)
                continue
        return docs_processed

    async def configure_gdrive(
        self,
        organization_id: str,
        name: str,
        service_account_json: str,
        folder_id: Optional[str] = None,
    ) -> Integration:
        """Configure a new Google Drive integration and test the connection."""
        connector = GoogleDriveConnector(
            service_account_json=service_account_json, folder_id=folder_id,
        )
        if not connector.test_connection():
            raise IntegrationSyncError("Failed to connect to Google Drive. Check service account credentials.")
        integration = Integration(
            id=str(uuid.uuid4()), organization_id=organization_id, name=name,
            integration_type="gdrive",
            config={"service_account_json": service_account_json, "folder_id": folder_id},
            is_active=True,
        )
        self.db.add(integration)
        await self.db.flush()
        logger.info("Google Drive integration configured: %s", name)
        return integration

    # ── Jira Sync ─────────────────────────────────────────────────

    async def _sync_jira(self, integration: Integration, organization_id: str) -> int:
        """Sync issues from a Jira project through the document pipeline."""
        config = integration.config
        connector = JiraConnector(url=config["url"], username=config["username"], api_token=config["api_token"])
        project_key = config.get("project_key")
        if not project_key:
            projects = connector.list_projects()
            total = 0
            for p in projects:
                pk = p.get("key")
                if pk:
                    total += await self._process_jira_issues(connector, pk, organization_id)
            return total
        return await self._process_jira_issues(connector, project_key, organization_id)

    async def _process_jira_issues(self, connector: JiraConnector, project_key: str, organization_id: str) -> int:
        """Fetch and process all issues in a Jira project."""
        issues = connector.get_project_issues(project_key)
        docs_processed = 0
        for issue in issues:
            try:
                content = issue.get("description", "")
                summary = issue.get("summary", "")
                title = f"[{issue['key']}] {summary}"
                if not content and not summary:
                    continue
                raw_text = f"{summary}\n\n{content}" if content else summary
                if not raw_text.strip():
                    continue

                ok = await self._index_content(
                    organization_id=organization_id, title=title, raw_text=raw_text,
                    filename=f"jira_{project_key}_{issue['key']}",
                    original_filename=f"{title}.html", file_type="html",
                    storage_path=f"jira://{project_key}/{issue['key']}",
                    category="jira",
                    tags=["jira", project_key, issue.get("issue_type", ""), issue.get("status", "")],
                )
                if ok:
                    docs_processed += 1
            except Exception as e:
                logger.error("Failed to process Jira issue %s: %s", issue.get("key"), e)
                continue
        return docs_processed

    # ── Google Drive Sync ─────────────────────────────────────────

    async def _sync_gdrive(self, integration: Integration, organization_id: str) -> int:
        """Sync files from Google Drive through the document pipeline."""
        config = integration.config
        connector = GoogleDriveConnector(
            service_account_json=config["service_account_json"],
            folder_id=config.get("folder_id"),
        )
        docs_processed = 0

        # Use sync_folder with callback to process each file
        connector.sync_folder(callback=lambda f: None)  # warm up auth
        files = connector.list_files()

        for f in files:
            try:
                file_name = f["name"]
                mime_type = f["mime_type"]
                file_id = f["id"]

                if mime_type.startswith("application/vnd.google-apps."):
                    raw_text = connector.export_text(file_id, mime_type)
                else:
                    tmp_path = connector.download_file(file_id, file_name, mime_type)
                    try:
                        result = await DocumentProcessor.extract_text(
                            file_path=tmp_path, filename=file_name, ocr=True,
                        )
                        raw_text = result.get("text", "")
                    finally:
                        try:
                            os.unlink(tmp_path)
                        except Exception:
                            pass

                if not raw_text.strip():
                    continue

                ext = os.path.splitext(file_name)[1].lower() or ".txt"
                ok = await self._index_content(
                    organization_id=organization_id, title=file_name,
                    raw_text=raw_text, filename=file_name,
                    original_filename=file_name,
                    file_type=ext[1:] if ext else "txt",
                    storage_path=f"gdrive://{file_id}", category="gdrive",
                    tags=["gdrive", mime_type],
                )
                if ok:
                    docs_processed += 1

            except Exception as e:
                logger.error("Failed to process GDrive file %s: %s", f.get("name"), e)
                continue
        return docs_processed
