"""
CorporateGPT - Import Smoke Test
Verifies all critical imports work without a running server.
Run: python -m tests.test_imports
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

errors = []
success = []

def try_import(name, import_str):
    try:
        __import__(import_str.split()[0])
        success.append(name)
        return True
    except Exception as e:
        errors.append((name, str(e)))
        return False

print("=== CorporateGPT Import Smoke Test ===\n")

# Core
print("Testing core imports...")
try_import("fastapi", "fastapi import FastAPI")
try_import("sqlalchemy", "sqlalchemy import create_engine")
try_import("pydantic", "pydantic import BaseModel")
try_import("pydantic_settings", "pydantic_settings import BaseSettings")
try_import("jose", "jose import jwt")
try_import("passlib", "passlib.hash import bcrypt")
try_import("openai", "openai import OpenAI")
try_import("qdrant_client", "qdrant_client import QdrantClient")
try_import("celery", "celery import Celery")
try_import("redis", "redis import Redis")

# App-specific
print("\nTesting app imports...")
try_import("config", "app.core.config import Settings")
try_import("database", "app.core.database import get_db")
try_import("security", "app.core.security import create_access_token")
try_import("deps", "app.core.deps import get_current_user")

# Models
print("\nTesting model imports...")
try_import("organizations", "app.models.organization import Organization")
try_import("users", "app.models.user import User")
try_import("roles", "app.models.role import Role, Permission")
try_import("documents", "app.models.document import Document, DocumentVersion")
try_import("chats", "app.models.chat import Chat, Message")

# Services
print("\nTesting service imports...")
try_import("llm_service", "app.services.llm_service import LLMService")
try_import("rag_service", "app.services.rag_service import RAGService")
try_import("vector_service", "app.services.vector_service import ensure_collection")
try_import("document_processor", "app.services.document_processor import extract_text")
try_import("chunking_service", "app.services.chunking_service import chunk_text")
try_import("embedding_service", "app.services.embedding_service import generate_embeddings")

# Routes
print("\nTesting route imports...")
try_import("auth_routes", "app.api.v1.endpoints.auth import router as auth_router")
try_import("org_routes", "app.api.v1.endpoints.organizations import router as org_router")
try_import("user_routes", "app.api.v1.endpoints.users import router as user_router")
try_import("doc_routes", "app.api.v1.endpoints.documents import router as doc_router")
try_import("chat_routes", "app.api.v1.endpoints.chat import router as chat_router")

# Workers
print("\nTesting worker imports...")
try_import("celery_app", "app.workers.celery_app import celery_app")

print(f"\n=== Results ===")
print(f"Successful: {len(success)}/{len(success) + len(errors)}")
if errors:
    print(f"\nErrors ({len(errors)}):")
    for name, err in errors:
        print(f"  - {name}: {err}")
else:
    print("\n✅ All imports successful!")
