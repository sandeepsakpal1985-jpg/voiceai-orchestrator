# Knowledge Module — `/api/knowledge`

Knowledge base documents (FAQ, products, policies, etc.) used to ground AI responses via RAG.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/knowledge` | List documents |
| GET | `/api/knowledge/:id` | Get a document's full content |
| POST | `/api/knowledge` | Create a document |
| PUT | `/api/knowledge/:id` | Update a document |
| DELETE | `/api/knowledge/:id` | Delete a document |
| POST | `/api/knowledge/upload` | File upload (coming soon — Supabase Storage) |

## Architecture

- Documents are typed as `faq`, `pricing`, `policy`, `product`, or `general`
- Content is stored as plain text for now; file upload support pending Supabase integration
- RAG pipeline: documents are embedded into Qdrant vector DB and retrieved contextually during AI response generation
