"""
CorporateGPT Enterprise — Main Application
Wires together FastAPI Users, Casbin, LlamaIndex, and all routes.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import get_engine, Base
from app.providers.auth import fastapi_users, auth_backend
from app.providers.observability import ObservabilityProvider
from app.providers.analytics import AnalyticsProvider

# Configure logging
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger("corpgpt")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.VERSION}")
    
    # Create database tables (dev mode)
    # For production, use: alembic upgrade head
    if settings.ENVIRONMENT == "development":
        async with get_engine().begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    
    # Initialize providers
    ObservabilityProvider.initialize()
    AnalyticsProvider.initialize()
    
    logger.info("Application started successfully")
    
    yield
    
    # Shutdown
    AnalyticsProvider.shutdown()
    ObservabilityProvider.flush()
    await get_engine().dispose()
    logger.info("Application shut down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# ── Middleware ──
from app.middleware.error_handler import ErrorHandlerMiddleware
from app.middleware.audit import AuditMiddleware

# Error handler must be first (outermost) to catch all exceptions
app.add_middleware(ErrorHandlerMiddleware)

# Audit logging for state-changing operations
app.add_middleware(AuditMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ──
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.organizations import router as org_router
from app.api.v1.endpoints.users import router as user_router
from app.api.v1.endpoints.departments import router as dept_router
from app.api.v1.endpoints.documents import router as doc_router
from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.search import router as search_router
from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.settings import router as settings_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.faq import router as faq_router
from app.api.v1.endpoints.integrations import router as integrations_router
from app.api.v1.endpoints.feedback import router as feedback_router
from app.api.v1.endpoints.bookmarks import router as bookmarks_router
from app.api.v1.endpoints.notifications import router as notifications_router
from app.api.v1.endpoints.audit_logs import router as audit_logs_router
from app.api.v1.endpoints.knowledge_health import router as knowledge_health_router

app.include_router(auth_router, prefix="/api/v1")
app.include_router(org_router, prefix="/api/v1")
app.include_router(user_router, prefix="/api/v1")
app.include_router(dept_router, prefix="/api/v1")
app.include_router(doc_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(health_router, prefix="/api/v1")
app.include_router(knowledge_health_router, prefix="/api/v1")
app.include_router(faq_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(bookmarks_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(audit_logs_router, prefix="/api/v1")
app.include_router(integrations_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": settings.VERSION}
