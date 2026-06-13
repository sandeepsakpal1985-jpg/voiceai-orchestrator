# Notifications Module — `/api/notifications`

In-app notification system for alerts, new leads, escalations, and AI insights.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List notifications (filterable: all or unread only) |
| GET | `/api/notifications/unread-count` | Get count of unread notifications |
| PUT | `/api/notifications/:id/read` | Mark a notification as read |
| PUT | `/api/notifications/read-all` | Mark all notifications as read |
| POST | `/api/notifications` | Create a notification (internal use) |

## Architecture

- Notification types: `new_lead`, `escalation`, `insight_ready`, `team_invite`, `system`
- Each notification has a `link` field pointing to the relevant page
- No real-time push yet — frontend polls `/unread-count` via the API
