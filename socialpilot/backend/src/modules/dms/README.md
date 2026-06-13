# DMs Module — `/api/dms`

Manage DM (Direct Message) conversations from Instagram and Facebook Messenger.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dms` | List conversations (paginated, filterable by status) |
| GET | `/api/dms/:id` | Get a conversation with all messages |
| POST | `/api/dms/:id/messages` | Send a message in a conversation |

## Architecture

- Conversations track `intent`, `leadScore`, `purchaseProbability`, and `urgencyScore`
- AI responses are generated contextually based on conversation history
- DM Worker (BullMQ) handles async processing with customer memory integration
- When `leadScore > 70`, the AI works toward delivering a CTA
