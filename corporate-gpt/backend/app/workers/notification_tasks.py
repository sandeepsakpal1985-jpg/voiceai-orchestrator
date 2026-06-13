"""Notification sending tasks — email, in-app, and digest notifications."""
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger("corpgpt.notification_tasks")


@celery_app.task(bind=True, max_retries=3)
def send_notification(self, user_id: str, title: str, message: str, notif_type: str, organization_id: str = None):
    """Send an in-app notification to a user.
    Creates a Notification record in the database.
    """
    try:
        from app.models.notification import Notification
        from app.core.database import get_session_factory
        from sqlalchemy import select
        from app.models.user import User
        import asyncio
        import uuid

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)

            async def _create_notification():
                async with get_session_factory() as session:
                    # Resolve org_id from user if not provided
                    org_id = organization_id
                    if not org_id:
                        result = await session.execute(
                            select(User).where(User.id == user_id)
                        )
                        user = result.scalar_one_or_none()
                        if user:
                            org_id = user.organization_id

                    notification = Notification(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        notification_type=notif_type,
                        title=title,
                        message=message,
                    )
                    session.add(notification)
                    await session.commit()

            loop.run_until_complete(_create_notification())
        finally:
            loop.close()

        return {"status": "sent", "user_id": user_id, "type": notif_type}
    except Exception as e:
        logger.error("Failed to send notification to %s: %s", user_id, e)
        return {"status": "failed", "user_id": user_id, "error": str(e)}


@celery_app.task(bind=True, max_retries=2)
def send_email_notification(self, to_email: str, subject: str, html_body: str):
    """Send an email notification via SMTP.
    Falls back gracefully if SMTP is not configured.
    """
    try:
        from app.services.email_service import send_email
        import asyncio

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(send_email([to_email], subject, html_body))
        finally:
            loop.close()

        return {"status": result.get("status", "sent"), "to": to_email}
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return {"status": "failed", "to": to_email, "error": str(e)}
