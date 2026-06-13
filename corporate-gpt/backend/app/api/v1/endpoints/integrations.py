"""Third-party integrations management (Confluence, SharePoint, Jira).
Uses the IntegrationSyncService to orchestrate connector syncs through the document pipeline.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.services.integration_sync_service import IntegrationSyncService, IntegrationSyncError

logger = logging.getLogger("corpgpt.integrations")
router = APIRouter(prefix="/integrations", tags=["integrations"])


class ConfluenceConfig(BaseModel):
    name: str
    url: str
    username: str
    api_token: str
    space_key: Optional[str] = None


class SharePointConfig(BaseModel):
    name: str
    site_url: str
    client_id: str
    client_secret: str


class JiraConfig(BaseModel):
    name: str
    url: str
    username: str
    api_token: str
    project_key: Optional[str] = None


class GoogleDriveConfig(BaseModel):
    name: str
    service_account_json: str
    folder_id: Optional[str] = None


def _get_sync_service(db: AsyncSession = Depends(get_db)) -> IntegrationSyncService:
    return IntegrationSyncService(db)


@router.get("/")
async def list_integrations(
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """List all configured integrations for the organization."""
    integrations = await service.list_integrations(current_user.organization_id)
    return [
        {
            "id": i.id,
            "name": i.name,
            "integration_type": i.integration_type,
            "is_active": i.is_active,
            "last_sync_at": i.last_sync_at.isoformat() if i.last_sync_at else None,
            "created_at": i.created_at.isoformat(),
        }
        for i in integrations
    ]


@router.post("/confluence")
async def configure_confluence(
    config: ConfluenceConfig = Body(...),
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Configure a Confluence integration. Tests connection before saving."""
    try:
        integration = await service.configure_confluence(
            organization_id=current_user.organization_id,
            name=config.name,
            url=config.url,
            username=config.username,
            api_token=config.api_token,
            space_key=config.space_key,
        )
        return {
            "id": integration.id,
            "name": integration.name,
            "integration_type": integration.integration_type,
            "status": "connected",
            "message": f"Successfully connected to Confluence at {config.url}",
        }
    except IntegrationSyncError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sharepoint")
async def configure_sharepoint(
    config: SharePointConfig = Body(...),
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Configure a SharePoint integration. Tests connection before saving."""
    try:
        integration = await service.configure_sharepoint(
            organization_id=current_user.organization_id,
            name=config.name,
            site_url=config.site_url,
            client_id=config.client_id,
            client_secret=config.client_secret,
        )
        return {
            "id": integration.id,
            "name": integration.name,
            "integration_type": integration.integration_type,
            "status": "connected",
            "message": f"Successfully connected to SharePoint at {config.site_url}",
        }
    except IntegrationSyncError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/jira")
async def configure_jira(
    config: JiraConfig = Body(...),
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Configure a Jira integration. Tests connection before saving."""
    try:
        integration = await service.configure_jira(
            organization_id=current_user.organization_id,
            name=config.name,
            url=config.url,
            username=config.username,
            api_token=config.api_token,
            project_key=config.project_key,
        )
        return {
            "id": integration.id,
            "name": integration.name,
            "integration_type": integration.integration_type,
            "status": "connected",
            "message": f"Successfully connected to Jira at {config.url}",
        }
    except IntegrationSyncError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/gdrive")
async def configure_gdrive(
    config: GoogleDriveConfig = Body(...),
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Configure a Google Drive integration. Tests connection before saving."""
    try:
        integration = await service.configure_gdrive(
            organization_id=current_user.organization_id,
            name=config.name,
            service_account_json=config.service_account_json,
            folder_id=config.folder_id,
        )
        return {
            "id": integration.id,
            "name": integration.name,
            "integration_type": integration.integration_type,
            "status": "connected",
            "message": f"Successfully connected to Google Drive",
        }
    except IntegrationSyncError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{integration_id}")
async def delete_integration(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Deactivate an integration."""
    try:
        await service.delete_integration(integration_id, current_user.organization_id)
        return {"status": "deactivated"}
    except IntegrationSyncError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{integration_id}/sync")
async def trigger_sync(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Trigger a sync for an integration. Syncs all content through the document pipeline."""
    try:
        job = await service.trigger_sync(integration_id, current_user.organization_id)
        return {
            "job_id": job.id,
            "status": job.status,
            "docs_processed": job.docs_processed,
            "error": job.error_log,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
    except IntegrationSyncError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{integration_id}/syncs")
async def list_syncs(
    integration_id: str,
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    service: IntegrationSyncService = Depends(_get_sync_service),
):
    """Get sync history for an integration."""
    try:
        jobs = await service.get_sync_history(
            integration_id, current_user.organization_id, limit
        )
        return [
            {
                "id": j.id,
                "status": j.status,
                "docs_processed": j.docs_processed,
                "docs_failed": j.docs_failed,
                "error": j.error_log,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ]
    except IntegrationSyncError as e:
        raise HTTPException(status_code=404, detail=str(e))
