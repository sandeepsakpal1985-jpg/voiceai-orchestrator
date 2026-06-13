"""Async SQLAlchemy engine and session factory.
Lazy initialization: engine is created on first use to avoid import-time crashes.
Fallback: if PostgreSQL+asyncpg fails, uses SQLite+aiosqlite for dev/test.
"""

import logging
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger("corpgpt.database")

# Lazy engine — populated on first call to get_engine() or get_db()
_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _resolve_database_url() -> str:
    """Determine the database URL, falling back to SQLite for dev/test.

    Handles three cases:
      1. System env DATABASE_URL uses psycopg2 (sync) — fall back to SQLite
      2. asyncpg not installed — fall back to SQLite
      3. All good — return the configured URL
    """
    from app.core.config import settings

    url = settings.DATABASE_URL

    # Only apply fallback logic in dev/test environments
    if settings.ENVIRONMENT not in ("development", "test"):
        return url

    # If URL doesn't have +asyncpg, it'll use the sync psycopg2 driver
    # which can't work with create_async_engine
    if "postgresql" in url and "+asyncpg" not in url:
        logger.warning(
            "PostgreSQL URL uses sync driver (psycopg2). "
            "Falling back to SQLite for development. "
            "Set DATABASE_URL=postgresql+asyncpg://... for PostgreSQL."
        )
        return "sqlite+aiosqlite:///./corpgpt_dev.db"

    # If URL has +asyncpg but asyncpg isn't installed, fall back
    if "+asyncpg" in url:
        try:
            import asyncpg  # noqa: F401
        except ImportError:
            logger.warning(
                "asyncpg not installed — falling back to SQLite for development. "
                "Install with: pip install asyncpg"
            )
            return "sqlite+aiosqlite:///./corpgpt_dev.db"

    return url


def get_engine() -> AsyncEngine:
    """Get or create the async engine (lazy)."""
    global _engine
    if _engine is None:
        from app.core.config import settings

        database_url = _resolve_database_url()
        _engine = create_async_engine(
            database_url,
            echo=settings.DEBUG,
            pool_size=20,
            max_overflow=10,
        )
        logger.info("Async engine created for %s ...", database_url[:40])
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get or create the session factory (lazy)."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _session_factory


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_transactional() -> AsyncGenerator[AsyncSession, None]:
    """Get database session with auto-commit/rollback."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
