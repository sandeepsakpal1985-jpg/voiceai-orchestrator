"""
CorporateGPT Configuration — Pydantic Settings
Includes all provider configurations.
"""
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=True,
    )

    # App
    APP_NAME: str = "CorporateGPT"
    VERSION: str = "2.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"
    
    # Security
    SECRET_KEY: str = "change-me-in-production"
    JWT_SECRET_KEY: str = "change-me-too"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_SECONDS: int = 3600
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://corpgpt:corpgpt_dev@localhost:5432/corpgpt"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "corpgpt"
    POSTGRES_PASSWORD: str = "corpgpt_dev"
    POSTGRES_DB: str = "corpgpt"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Qdrant (Vector DB)
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "corpgpt_documents"
    QDRANT_VECTOR_SIZE: int = 1536
    
    # LLM (OpenAI-compatible — works with Ollama, OpenAI, Open WebUI)
    LLM_PROVIDER: str = "openai"
    LLM_MODEL: str = "gpt-4o-mini"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "http://localhost:11434/v1"
    
    # Embeddings
    EMBEDDING_PROVIDER: str = "openai"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    
    # File Storage
    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "./storage"
    STORAGE_MAX_FILE_SIZE: int = 52428800
    
    # OCR
    OCR_ENABLED: bool = True
    OCR_LANGUAGE: str = "eng"
    
    # Chunking
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000"
    CORS_ALLOW_CREDENTIALS: bool = True
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Langfuse (LLM Observability)
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    
    # PostHog (Product Analytics)
    POSTHOG_API_KEY: str = ""
    POSTHOG_HOST: str = "https://app.posthog.com"
    
    # Email
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_FROM: str = "noreply@corpgpt.local"


settings = Settings()
