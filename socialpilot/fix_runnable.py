"""
Make CorporateGPT actually runnable:
1. Fix config.py to force-load the right .env regardless of working directory
2. Test full app.main import
3. Verify all routes register
4. Create proper startup scripts
"""
import os
import subprocess
import sys

BASE = r'C:\Users\sande\ai-orchestrator\corporate-gpt'
BACKEND = os.path.join(BASE, 'backend')

# ================================================================
# FIX 1: Update config.py to force-load the right .env
# ================================================================
print("=== FIX 1: Config.py .env loading ===")
cfg_path = os.path.join(BACKEND, 'app', 'core', 'config.py')

# Add python-dotenv load at the top to force correct .env
old = '''"""
CorporateGPT Configuration — Pydantic Settings
Includes all provider configurations.
"""
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):'''

new = '''"""
CorporateGPT Configuration — Pydantic Settings
Includes all provider configurations.
"""
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Force-load the correct .env file from the project root
_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=True)


class Settings(BaseSettings):'''

cfg = open(cfg_path, 'r').read()
cfg = cfg.replace(old, new)
open(cfg_path, 'w').write(cfg)
print("  Added dotenv force-load to config.py")

# ================================================================
# FIX 2: Create a proper entry point script
# ================================================================
print("\n=== FIX 2: Creating run script ===")
run_script = '''#!/usr/bin/env python3
"""
CorporateGPT Enterprise — Quick Start
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
'''

with open(os.path.join(BASE, 'run.py'), 'w') as f:
    f.write(run_script)
print("  Created run.py")

# ================================================================
# TEST: Full app import
# ================================================================
print("\n=== TEST: Full app.main import ===")

# Clear env vars first
for key in list(os.environ.keys()):
    if key in ["DATABASE_URL", "SECRET_KEY", "JWT_SECRET_KEY", "JWT_ALGORITHM",
               "OPENAI_API_KEY", "LLM_MODEL", "REDIS_URL", "QDRANT_URL",
               "POSTGRES_SERVER", "POSTGRES_USER", "POSTGRES_PASSWORD", 
               "POSTGRES_DB", "ENVIRONMENT", "AUTH_SECRET", "ALLOWED_HOSTS"]:
        del os.environ[key]

# Change to project root so .env is found
os.chdir(BASE)

result = subprocess.run(
    [sys.executable, '-c', '''
import os

# Clear env vars
for key in list(os.environ.keys()):
    if key in ["DATABASE_URL", "SECRET_KEY", "JWT_SECRET_KEY", 
               "OPENAI_API_KEY", "LLM_MODEL", "REDIS_URL", "QDRANT_URL",
               "POSTGRES_SERVER", "POSTGRES_USER", "POSTGRES_PASSWORD", 
               "POSTGRES_DB", "ENVIRONMENT", "AUTH_SECRET", "ALLOWED_HOSTS"]:
        del os.environ[key]

import sys
sys.path.insert(0, r"C:\\Users\\sande\\ai-orchestrator\\corporate-gpt\\backend")

try:
    from app.main import app
    routes = [(r.path, getattr(r, 'methods', None)) for r in app.routes if hasattr(r, 'path')]
    print(f"SUCCESS: App imported with {len(routes)} routes!")
    print()
    for path, methods in sorted(routes, key=lambda x: x[0]):
        m = ", ".join(sorted(methods)) if methods else "ANY"
        print(f"  {m:8s} {path}")
except Exception as e:
    import traceback
    traceback.print_exc()
'''],
    capture_output=True, text=True, cwd=BASE, env={k: v for k, v in os.environ.items() 
                                                     if k not in ["DATABASE_URL", "SECRET_KEY", 
                                                                  "JWT_SECRET_KEY", "OPENAI_API_KEY",
                                                                  "REDIS_URL", "QDRANT_URL",
                                                                  "POSTGRES_SERVER", "POSTGRES_USER",
                                                                  "POSTGRES_PASSWORD", "POSTGRES_DB"]}
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr[-1000:])

# ================================================================
# FIX 3: Create .env.example
# ================================================================
print("\n=== FIX 3: Creating .env.example ===")
env_example = '''# CorporateGPT Enterprise - Environment Configuration
# Copy this file to .env and customize

# Database (SQLite for local dev, PostgreSQL for production)
DATABASE_URL=sqlite+aiosqlite:///./corpgpt.db
# For PostgreSQL: DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/corpgpt

# Security
SECRET_KEY=change-this-to-a-random-secret-key
JWT_SECRET_KEY=change-this-to-another-random-key
ENVIRONMENT=development
DEBUG=true

# LLM (Ollama for local dev, OpenAI for cloud)
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=corpgpt_documents

# Cache / Queue
REDIS_URL=redis://localhost:6379/0

# Storage
STORAGE_LOCAL_PATH=./storage
LOG_LEVEL=INFO

# Langfuse (LLM Observability) - optional
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# PostHog (Analytics) - optional
POSTHOG_API_KEY=
'''

with open(os.path.join(BASE, '.env.example'), 'w') as f:
    f.write(env_example)
print("  Created .env.example")

print("\n=== DONE ===")
