"""Integration sync tasks — runs connector syncs asynchronously."""
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger("corpgpt.sync_tasks")


@celery_app.task(bind=True, max_retries=3, soft_time_limit=600)
def run_integration_sync(self, integration_id: str, organization_id: str):
    """Run an integration sync asynchronously via Celery.
    Uses IntegrationSyncService to process all pages/files through the document pipeline.
    """
    try:
        from app.services.integration_sync_service import IntegrationSyncService
        from app.core.database import get_session_factory
        import asyncio

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)

            async def _run_sync():
                async with get_session_factory() as session:
                    service = IntegrationSyncService(session)
                    job = await service.trigger_sync(integration_id, organization_id)
                    return job

            job = loop.run_until_complete(_run_sync())
        finally:
            loop.close()

        return {
            "status": job.status,
            "integration_id": integration_id,
            "docs_processed": job.docs_processed,
            "docs_failed": job.docs_failed,
        }
    except Exception as e:
        logger.error("Integration sync failed for %s: %s", integration_id, e)
        raise self.retry(exc=e, countdown=300)  # Retry in 5 minutes
