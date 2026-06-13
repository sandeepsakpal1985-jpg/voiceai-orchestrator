# Open WebUI Integration with CorporateGPT
# ====================================================
# Open WebUI (https://openwebui.com) is a self-hosted ChatGPT-like interface
# that can be configured to use CorporateGPT as its backend API.
#
# This enables employees to use a familiar ChatGPT-style interface
# while querying the CorporateGPT enterprise knowledge base.

## Option 1: Point Open WebUI at CorporateGPT API

Set these environment variables when running Open WebUI:

```bash
docker run -d -p 3000:3000 \
  -e OPENAI_API_BASE_URL=http://corpgpt-backend:8000/api/v1 \
  -e OPENAI_API_KEY=corpgpt \
  -e DEFAULT_MODEL=corpgpt-rag \
  -e WEBUI_NAME=CorporateGPT \
  ghcr.io/open-webui/open-webui:main
```

## Option 2: Reverse Proxy Configuration

For production deployments, configure nginx to route:
- `/ollama/*` → Ollama server (for direct LLM access)
- `/corpgpt/*` → CorporateGPT backend
- `/open-webui/*` → Open WebUI frontend

```nginx
# /etc/nginx/sites-available/corpgpt
server {
    listen 443 ssl;
    server_name knowledge.company.com;

    # Open WebUI frontend
    location / {
        proxy_pass http://open-webui:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # CorporateGPT API
    location /api/v1/ {
        proxy_pass http://corpgpt-backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Ollama API (for Open WebUI's built-in chat)
    location /ollama/ {
        proxy_pass http://ollama:11434/;
        proxy_set_header Host $host;
    }
}
```

## Option 3: Embedded IFrame

For existing intranet portals:
```html
<iframe
  src="https://open-webui.company.com/?models=corpgpt-rag"
  width="100%"
  height="600px"
  style="border: none; border-radius: 8px;"
  title="CorporateGPT Assistant"
></iframe>
```

## Custom Open WebUI Tool for CorporateGPT

Open WebUI supports custom "tools" (function calls). Create a tool that
queries the CorporateGPT RAG API:

```python
# Open WebUI Tool: CorporateGPT Knowledge Search
import requests
import json

class Tools:
    def __init__(self):
        pass

    def corpgpt_search(self, query: str, top_k: int = 5) -> str:
        """
        Search CorporateGPT enterprise knowledge base.
        
        :param query: The employee's question
        :param top_k: Number of documents to retrieve
        :return: Answer with citations from company docs
        """
        response = requests.post(
            "http://corpgpt-backend:8000/api/v1/search",
            json={"query": query, "top_k": top_k},
            headers={"Authorization": "Bearer YOUR_API_KEY"},
        )
        return json.dumps(response.json(), indent=2)
    
    def corpgpt_query(self, query: str, mode: str = "strict") -> str:
        """
        Ask CorporateGPT with RAG (3 modes: strict, general, expert).
        
        :param query: The employee's question
        :param mode: strict|general|expert
        :return: Answer with citations
        """
        response = requests.post(
            "http://corpgpt-backend:8000/api/v1/chat/completions",
            json={"query": query, "mode": mode},
            headers={"Authorization": "Bearer YOUR_API_KEY"},
        )
        return json.dumps(response.json(), indent=2)
```

## Option 4: Direct Ollama Integration

Since CorporateGPT uses Ollama-compatible API, Open WebUI can connect directly
to the Ollama instance for general chat while CorporateGPT handles knowledge retrieval:

```yaml
# docker-compose.override.yml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3001:8080"
    environment:
      OLLAMA_BASE_URL: http://ollama:11434
      OPENAI_API_BASE_URL: http://backend:8000/api/v1
      WEBUI_NAME: CorporateGPT
    depends_on:
      - ollama
      - backend
```

## Architecture Notes

Open WebUI + CorporateGPT creates a powerful combination:
- **Open WebUI**: User-facing ChatGPT-like interface, conversation management
- **CorporateGPT**: Enterprise knowledge retrieval, RAG, RBAC, audit trails
- **Ollama**: Local LLM inference (or use OpenAI/Anthropic as alternative)

The two systems work together:
1. Employee chats in Open WebUI
2. Open WebUI calls CorporateGPT API for knowledge queries
3. CorporateGPT retrieves from Qdrant via LlamaIndex
4. Response includes citations from company documents
5. All queries are logged in audit trails
