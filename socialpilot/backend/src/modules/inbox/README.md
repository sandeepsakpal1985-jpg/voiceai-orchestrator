# Inbox Module — `/api/inbox`

Unified inbox for managing comments + DMs in one place. Provides filtering, prioritization, and team assignment.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/inbox` | List inbox items (paginated, filterable by status/priority/type) |
| GET | `/api/inbox/:id` | Get item details (marks as read) |
| PUT | `/api/inbox/:id/note` | Update internal note |
| PUT | `/api/inbox/:id/assign` | Assign item to a team member |
| PUT | `/api/inbox/:id/status` | Update item status |

## Architecture

- Items come from both `SocialComment` and `DMConversation` tables
- Priority levels: `urgent`, `high`, `normal`, `low`
- Statuses: `unread`, `read`, `replied`, `resolved`, `archived`
- Items with `escalationScore > 0` are flagged for priority review
