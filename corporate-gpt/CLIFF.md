# CorporateGPT Enterprise — CLIFF (Continuity Log for AI Future Focus)

## Project Overview
- **Product:** Enterprise Knowledge Intelligence Platform
- **Location:** `C:\Users\sande\ai-orchestrator\corporate-gpt`
- **Status:** v1.6 — Production-Hardened + 4 Integrations ✅ (~200 files)

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn UI |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL (async SQLAlchemy) with **SQLite dev fallback** |
| Vector DB | Qdrant (via LlamaIndex) |
| Cache/Queue | Redis + Celery |
| Auth | JWT + FastAPI Users + RBAC (5 roles) + Multi-tenant |
| AI | OpenAI-compatible LLM, LlamaIndex RAG with **token-level SSE streaming** |
| Observability | Langfuse (LLM tracing), PostHog (analytics) |
| Deployment | Docker Compose (dev/airgap/prod) |
| Integrations | **Confluence, SharePoint, Jira, Google Drive** |

## All Tasks Completed ✅

### Infrastructure Fixes
1. **Lazy database engine**: `database.py` lazy-initializes on first use. Falls back to SQLite automatically.
2. **Model import chain**: Fixed `user.py` missing `SQLAlchemyBaseUserTable`. Renamed `metadata` columns across 4 models.
3. **pydantic-settings v2**: Switched to `SettingsConfigDict` syntax.
4. **System env isolation**: Falls back to SQLite when sync PG driver detected.

### Database & Middleware
5. **get_session_factory()**: Updated 6 files to use lazy accessor.
6. **User model**: Added missing `feedback`, `bookmarks`, `notifications` relationships.

### RAG & Streaming
7. **RAGService.stream_query()**: Token-level SSE streaming.
8. **Chat streaming endpoint**: Fixed dead code, proper async generator.
9. **send_message API**: Fixed `confidence_score` → `score` key mismatch.

### Jira Integration
10. **JiraConnector**: `test_connection()`, `list_projects()`, `get_project_issues()`, `sync_project()`.
11. **IntegrationSyncService**: `configure_jira()`, `_sync_jira()`, `_process_jira_issues()`.
12. **API endpoint**: `JiraConfig` model + `POST /integrations/jira`.
13. **`_index_content` helper**: Eliminated ~30 lines of duplication across all connectors.

### Google Drive Integration (New!)
14. **GoogleDriveConnector** (`connectors/gdrive.py`): Full connector with `test_connection()`, `list_files()`, `download_file()`, `export_text()`, `sync_folder()`. Uses google-api-python-client with service account auth. Handles Google-native formats (Docs/Sheets/Slides) via export to text/CSV, and binary file downloads with text extraction.
15. **IntegrationSyncService**: `configure_gdrive()`, `_sync_gdrive()` methods.
16. **API endpoint**: `GoogleDriveConfig` model + `POST /integrations/gdrive`.

### Testing
17. **Jira connector tests**: 13 tests for connector + service Jira methods.
18. **Refactored tests**: conftest.py `scalars()` fix, RAG test llama_index mocking.
19. **46 total tests**: RAG (10), integration sync (14), document processor (8), Jira connector (13).

## Known Issues
1. **System env vars**: Shell has `DATABASE_URL` and `EMBEDDING_MODEL` global. Fix: `unset DATABASE_URL EMBEDDING_MODEL`.
2. **Chat streaming**: Only strict mode streams tokens.
3. **Import chain slow**: System env vars cause ~30s Python import delays.

## Next Steps
1. Run end-to-end with PostgreSQL + Qdrant + Redis (`docker-compose up`)
2. Deploy production stack with Docker Compose
3. Add OneDrive connector
