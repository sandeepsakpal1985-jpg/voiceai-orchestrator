"""
Fix database.py and verify the backend app can import + start
"""
import os
import subprocess
import sys

BASE = r'C:\Users\sande\ai-orchestrator\corporate-gpt\backend'

# FIX: Change settings.db_url to settings.DATABASE_URL
print("=== FIX: database.py config attribute ===")
db_path = os.path.join(BASE, 'app', 'core', 'database.py')
content = open(db_path, 'r').read()
content = content.replace('settings.db_url', 'settings.DATABASE_URL')
content = content.replace('settings.DEBUG', 'settings.DEBUG')
open(db_path, 'w').write(content)
print("  Fixed: settings.db_url -> settings.DATABASE_URL")

# FIX: Also check config.py for any missing attributes
print("\n=== CHECK: config.py ===")
cfg_path = os.path.join(BASE, 'app', 'core', 'config.py')
cfg = open(cfg_path, 'r').read()
# Ensure DATABASE_URL is in the config
if 'DATABASE_URL' in cfg:
    print("  DATABASE_URL found in config ✓")
if 'db_url' in cfg:
    print("  WARNING: db_url found in config - should be DATABASE_URL")

# FIX: Check main.py for any import issues
print("\n=== CHECK: main.py ===")
main_path = os.path.join(BASE, 'app', 'main.py')
main = open(main_path, 'r').read()
if 'from app.providers.auth' in main:
    print("  Has auth import ✓")
if 'from app.api.v1.endpoints' in main:
    import_count = main.count('import router')
    print(f"  Router imports: {import_count}")

# TEST: Try importing the app
print("\n=== TEST: Importing app.main ===")
result = subprocess.run(
    [sys.executable, '-c', '''
import sys
sys.path.insert(0, r'C:\\Users\\sande\\ai-orchestrator\\corporate-gpt\\backend')
try:
    from app.main import app
    print(f"SUCCESS: App imported!")
    routes = [r for r in app.routes if hasattr(r, 'path')]
    print(f"  Routes registered: {len(routes)}")
    for r in routes[:8]:
        print(f"  {r.path}")
except Exception as e:
    import traceback
    traceback.print_exc()
'''],
    capture_output=True, text=True, cwd=BASE
)
print(result.stdout)
if result.stderr:
    print(f"STDERR: {result.stderr[-500:]}")

# TEST: Check for .env and create if missing
print("\n=== CHECK: .env file ===")
env_path = os.path.join(r'C:\Users\sande\ai-orchestrator\corporate-gpt', '.env')
if not os.path.exists(env_path):
    env_content = '''# CorporateGPT Enterprise - Local Development
DATABASE_URL=sqlite+aiosqlite:///./corpgpt.db
SECRET_KEY=dev-secret-key-test
JWT_SECRET_KEY=dev-jwt-secret-key-test
ENVIRONMENT=development
DEBUG=true
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
LLM_MODEL=gpt-4o-mini
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379/0
'''
    with open(env_path, 'w') as f:
        f.write(env_content)
    print("  Created .env with local dev defaults")
else:
    print("  .env exists")

# Create a simple startup script
print("\n=== CREATE: startup script ===")
startup = '''#!/bin/bash
# CorporateGPT Enterprise - Quick Start
echo "=== CorporateGPT Enterprise ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env with defaults..."
    cat > .env << 'EOF'
DATABASE_URL=sqlite+aiosqlite:///./corpgpt.db
SECRET_KEY=dev-secret-key-change-me
JWT_SECRET_KEY=dev-jwt-secret-key-change-me
ENVIRONMENT=development
DEBUG=true
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
LLM_MODEL=gpt-4o-mini
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379/0
EOF
fi

# Start backend
echo "Starting backend..."
cd backend
"$PYTHON" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

echo ""
echo "Backend started (PID: $BACKEND_PID)"
echo "API: http://localhost:8000"
echo "Docs: http://localhost:8000/docs"
echo ""
echo "To start frontend: cd frontend && npm run dev"
echo ""
echo "Press Ctrl+C to stop"

wait $BACKEND_PID
'''
with open(os.path.join(r'C:\Users\sande\ai-orchestrator\corporate-gpt', 'start.sh'), 'w') as f:
    f.write(startup)
print("  Created start.sh")

# Also create a Docker-based startup as start-docker.sh
docker_start = '''#!/bin/bash
# CorporateGPT Enterprise - Docker Quick Start
echo "=== CorporateGPT Enterprise (Docker) ==="
echo ""

# Pull Ollama models (first time only)
echo "Pulling default Ollama models..."
docker exec -it $(docker compose ps -q ollama) ollama pull llama3.2:3b 2>/dev/null || true
docker exec -it $(docker compose ps -q ollama) ollama pull nomic-embed-text 2>/dev/null || true

# Start all services
echo "Starting services..."
docker compose up -d

echo ""
echo "Services:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "  Qdrant UI: http://localhost:6333"
echo "  Ollama: http://localhost:11434"
echo ""
echo "To stop: docker compose down"
'''
with open(os.path.join(r'C:\Users\sande\ai-orchestrator\corporate-gpt', 'start-docker.sh'), 'w') as f:
    f.write(docker_start)
print("  Created start-docker.sh")

print("\n=== DONE ===")
