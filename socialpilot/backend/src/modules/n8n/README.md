# n8n Automation Module

**Prefix:** `/api/n8n`

Bridges SocialPilot's backend with n8n (https://n8n.io) for visual workflow automation.
Allows delegating re-engagement, notifications, and other automatable workflows to n8n's
webhook-triggered engine instead of running them inline in BullMQ workers.

## Configuration

| Env Variable | Required | Description |
|-------------|----------|-------------|
| `N8N_BASE_URL` | No | n8n instance URL (e.g., `https://your-n8n.example.com`) |
| `N8N_API_KEY` | No | Optional API key sent as `X-N8N-API-Key` header |

If `N8N_BASE_URL` is not set, all n8n methods return `{ triggered: false }` and
the calling code falls back to its existing inline logic — n8n integration is
fully optional.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | JWT | Check n8n connection status |
| PUT | `/config` | JWT | Update n8n config at runtime |
| POST | `/test` | JWT | Send a test payload to any webhook |
| POST | `/trigger/reengagement` | JWT | Trigger re-engagement workflow |

## n8n Webhook Setup

1. Create a new n8n workflow with a **Webhook** trigger node
2. Set the webhook path to `socialpilot-reengagement` (or a custom ID)
3. Activate the workflow — n8n provides a URL like `https://your-n8n.example.com/webhook/socialpilot-reengagement`
4. Set `N8N_BASE_URL` to your n8n instance URL

### Expected Webhook Payload

```json
{
  "event": "reengagement",
  "userId": "user_abc123",
  "customerId": "lead_xyz789",
  "stage": "24h",
  "customerName": "Jane Doe",
  "leadScore": 72,
  "product": "SocialPilot AI",
  "timestamp": "2025-12-01T10:00:00.000Z"
}
```

The webhook can respond with JSON that will be passed back to the caller
(see `/api/n8n/test` response).

## Service

`backend/src/services/n8n/n8n-service.ts` — Lightweight HTTP client for triggering
n8n webhook workflows:
- `configureN8n(cfg)` — Initialize or update config
- `isN8nConfigured()` — Check if ready
- `triggerWebhook(webhookId, payload)` — POST to a webhook URL
- `triggerReengagement(params)` — Convenience wrapper for re-engagement
