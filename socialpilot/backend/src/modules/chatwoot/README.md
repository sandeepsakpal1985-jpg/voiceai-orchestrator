# Chatwoot Integration Module

**Prefix:** `/api/chatwoot`

Bridges SocialPilot's AI pipeline with Chatwoot's unified inbox. Incoming messages from Chatwoot flow into SocialPilot's inbox for AI processing, and AI responses can be sent back to Chatwoot conversations.

## Configuration

| Env Variable | Required | Description |
|-------------|----------|-------------|
| `CHATWOOT_BASE_URL` | Yes | Chatwoot instance URL (e.g., `https://app.chatwoot.com`) |
| `CHATWOOT_ACCOUNT_ID` | Yes | Chatwoot account ID (numeric) |
| `CHATWOOT_ACCESS_TOKEN` | Yes | Personal Access Token from Chatwoot profile settings |
| `CHATWOOT_WEBHOOK_SECRET` | No | Optional shared secret for webhook signature verification |

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | JWT | Check Chatwoot connection status |
| POST | `/webhook` | None (or webhook secret) | Receive Chatwoot webhook events |
| POST | `/sync/contact` | JWT | Sync a contact to Chatwoot |
| POST | `/sync/message` | JWT | Send a message to a Chatwoot conversation |

## Webhook Events

Currently handles:
- `message_created` (incoming) — Stored as inbox item for AI processing

## Service

`backend/src/services/chatwoot/chatwoot-service.ts` — HTTP client wrapping Chatwoot REST API v1.
