"""
CorporateGPT Providers — Thin integration layers around best-in-class OSS libraries.
Each provider is a stateless wrapper that can be swapped without affecting business logic.
"""
from app.providers.auth import AuthProvider, fastapi_users, jwt_strategy
from app.providers.authorization import AuthorizationProvider, get_enforcer
from app.providers.rag import RAGProvider
from app.providers.document_processing import DocumentProcessingProvider
from app.providers.observability import ObservabilityProvider
from app.providers.analytics import AnalyticsProvider
