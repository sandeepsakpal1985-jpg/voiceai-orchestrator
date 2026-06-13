# Meta Module — `/api/meta`

Instagram & Facebook OAuth integration via Meta's Graph API. Handles the full OAuth flow, webhook verification, and connection management.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meta/auth` | JWT | Redirects to Meta OAuth dialog with platform param |
| GET | `/api/meta/callback` | No | OAuth callback — exchanges code for long-lived token |
| GET | `/api/meta/connections` | JWT | List user's Meta connections |
| DELETE | `/api/meta/connections/:id` | JWT | Remove a Meta connection |
| POST | `/api/meta/refresh-token` | JWT | Exchange token for a new long-lived token |
| GET | `/api/meta/webhook` | No | Meta webhook verification (GET challenge) |
| POST | `/api/meta/webhook` | No | Meta webhook event handler |

## Architecture

- **OAuth Flow:** `GET /auth` → redirects to Meta → user authorizes → Meta redirects to `/callback` → code exchanged for short-lived token → exchanged for long-lived (60-day) token → fetches Facebook Pages & Instagram Business Account → creates/updates `MetaConnection` record
- **Webhook:** Uses `META_WEBHOOK_VERIFY_TOKEN` for challenge verification, then handles incoming events (comments, messages, etc.)
- **Token refresh:** Uses Meta's `GET /oauth/access_token` with `grant_type=fb_exchange_token`
