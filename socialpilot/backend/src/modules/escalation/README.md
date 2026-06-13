# Escalation Module — `/api/escalations`

Handles escalated conversations that require human intervention. When the AI detects legal threats, complaints, or sensitive issues, it creates an escalation ticket and pauses AI responses.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/escalations` | List escalation tickets (filterable by status) |
| GET | `/api/escalations/:id` | Get a ticket's details |
| PUT | `/api/escalations/:id` | Update ticket (status, assignment, resolution) |

## Architecture

- Escalation reasons: `legal_threat`, `complaint`, `harassment`, `refund_request`, `other`
- Severity levels: `low`, `medium`, `high`, `critical`
- When a ticket is created with `aiPaused: true`, the AI stops responding to that customer
- Frontend inbox shows escalation alerts prominently
