#!/usr/bin/env python3
"""
CorporateGPT Enterprise - Quick Start
Run this script to start the backend server.
"""
import os
import sys
import subprocess

# Ensure we're in the project root
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_ROOT)

# Clear conflicting env vars that may leak from other projects
CONFLICTING_KEYS = [
    "DATABASE_URL", "SECRET_KEY", "JWT_SECRET_KEY", "JWT_ALGORITHM",
    "OPENAI_API_KEY", "LLM_MODEL", "LLM_PROVIDER",
    "REDIS_URL", "QDRANT_URL", "QDRANT_COLLECTION",
    "POSTGRES_SERVER", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB",
    "AUTH_SECRET", "ENVIRONMENT", "ALLOWED_HOSTS",
]
for key in CONFLICTING_KEYS:
    if key in os.environ:
        del os.environ[key]

# Start uvicorn
backend_dir = os.path.join(PROJECT_ROOT, "backend")
os.chdir(backend_dir)

print("=" * 60)
print("  CorporateGPT Enterprise v2.0")
print("=" * 60)
print()
print(f"  Working directory: {backend_dir}")
print(f"  API: http://localhost:8000")
print(f"  Docs: http://localhost:8000/docs")
print()
print("  Press Ctrl+C to stop")
print()

sys.exit(subprocess.call([
    sys.executable, "-m", "uvicorn",
    "app.main:app",
    "--host", "0.0.0.0",
    "--port", "8000",
    "--reload",
]))
