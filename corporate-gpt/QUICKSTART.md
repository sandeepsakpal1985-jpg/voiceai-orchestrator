# CorporateGPT - Quick Start Guide

Your AI-powered corporate knowledge base. Upload your SOPs, policies, and documents — then ask questions in natural language.

---

## Quick Start (5 minutes)

### Step 1: Start the Backend

Open a terminal and run:
```bash
cd C:\Users\sande\ai-orchestrator\corporate-gpt
python run.py
```

Wait for this output:
```
CorporateGPT Enterprise v2.0
API: http://localhost:8000
Docs: http://localhost:8000/docs
```

> **Already running?** The server may still be up from our previous session. Check by visiting http://localhost:8000/health in your browser — you should see `{"status":"healthy"}`.

---

### Step 2: Verify Everything is Ready

Open another terminal and run this quick check:
```bash
cd C:\Users\sande\ai-orchestrator\corporate-gpt\backend
python -c "
import requests
r = requests.get('http://localhost:8000/health')
print('Backend:', r.json())
"
```

You should see: `Backend: {'status': 'healthy', 'version': '2.0.0'}`

---

### Step 3: Log In (Get Your API Token)

Your pre-created admin account:

| Field | Value |
|-------|-------|
| **Email** | `admin@corpgpt.com` |
| **Password** | `Admin123!` |

To get your access token via API:
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@corpgpt.com&password=Admin123!"
```

Save the `access_token` from the response — you'll need it for all subsequent API calls.

---

### Step 4: Upload Your SOPs & Documents

Here's how to upload your documents so the AI can learn from them:

#### Option A: Upload via API (Quickest)

```bash
# Replace YOUR_TOKEN with the access token from Step 3
set TOKEN=YOUR_TOKEN

# Upload a file (supports PDF, DOCX, TXT, MD, HTML, CSV, XLSX, PPTX)
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -H "Authorization: Bearer %TOKEN%" \
  -F "file=@C:\path\to\your\sop.pdf" \
  -F "category=SOP" \
  -F "tags=policy,onboarding,procedure"
```

**Supported formats:** PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, HTML, JSON, XML, PNG, JPG

#### Option B: Batch Upload Multiple Files

Create a script file `upload_docs.py`:
```python
import os, requests

TOKEN = "YOUR_ACCESS_TOKEN"
FOLDER = "C:\path\to\your\documents"  # Change this to your folder

for filename in os.listdir(FOLDER):
    filepath = os.path.join(FOLDER, filename)
    if not os.path.isfile(filepath):
        continue
    with open(filepath, "rb") as f:
        r = requests.post(
            "http://localhost:8000/api/v1/documents/upload",
            headers={"Authorization": f"Bearer {TOKEN}"},
            files={"file": (filename, f)},
            data={"category": "Knowledge Base", "tags": "auto-upload"},
        )
        if r.status_code in (200, 201):
            print(f"  OK: {filename}")
        else:
            print(f"  FAIL: {filename} - {r.text[:100]}")
```

Run it:
```bash
python upload_docs.py
```

---

### Step 5: Ask Questions & Get Answers

#### Via API (Single Q&A)

```bash
# First, create a chat session
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer %TOKEN%" \
  -H "Content-Type: application/json" \
  -d '{"title": "My SOP Query"}'

# Note the chat_id from the response, then ask a question
curl -X POST http://localhost:8000/api/v1/chat/CHAT_ID/messages \
  -H "Authorization: Bearer %TOKEN%" \
  -H "Content-Type: application/json" \
  -d '{"content": "What is the process for onboarding new customers?", "role": "user"}'
```

#### Via the Automated Test Script

We created a ready-to-use test script:
```bash
cd backend
python test_corpgpt.py
```

This script will:
1. Log in as admin
2. Upload a sample SOP document (Customer Onboarding procedure)
3. Search the knowledge base
4. Ask the AI about the SOP content
5. Show the AI response with citations

---

### Step 6: Using the Swagger UI (Easiest for Beginners)

Open your browser and go to:
```
http://localhost:8000/docs
```

This opens an interactive API explorer where you can:
1. Click **Authorize** and paste your token (format: `Bearer YOUR_TOKEN`)
2. Try endpoints visually without writing curl commands
3. See request/response schemas for every endpoint

---

## Understanding How It Works

```
Your Documents → [PDF/DOCX/TXT] → Text Extraction → Chunking → Vector Embeddings → Qdrant Vector DB
                                                                                    |
Your Question ──────────────────────────────────────────────────────────────────────┘
                                                                                    |
                                                                              Semantic Search
                                                                                    |
                                                                          LLM + Your Docs
                                                                                    |
                                                                           AI Answer + Citations
```

1. **Upload**: Your documents are processed, split into chunks, and converted to vector embeddings
2. **Index**: The vectors are stored in Qdrant (vector database)
3. **Query**: When you ask a question, it finds the most relevant document chunks
4. **Answer**: The AI (via Ollama/OpenAI) generates an answer using ONLY your documents as context

---

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/auth/login` | POST | Log in, get token |
| `/api/v1/documents/upload` | POST | Upload a document |
| `/api/v1/documents/` | GET | List all documents |
| `/api/v1/search?q=question` | GET | Search documents |
| `/api/v1/chat` | POST | Create chat session |
| `/api/v1/chat/{id}/messages` | POST | Ask a question |
| `/api/v1/chat/{id}/stream` | POST | Stream AI response |

---

## Troubleshooting

**Backend won't start?**
```bash
cd backend
python -c "from app.main import app; print('OK')"
```
Check for import errors.

**Login fails?**
Make sure the seed script ran. If not:
```bash
cd backend
python -m app.seed
```

**Documents not being indexed?**
- Ensure Qdrant is running (`http://localhost:6333`)
- Check the AI service is reachable (Ollama at `http://localhost:11434` or your configured provider)

**Need help?**
- API Docs: http://localhost:8000/docs
- Check the server terminal for error logs
