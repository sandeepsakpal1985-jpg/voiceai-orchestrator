# Comments Module — `/api/comments`

Manage Instagram and Facebook comments. Supports CRUD, AI classification, reply management, and lead scoring.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/comments` | List comments (paginated, filterable by status) |
| GET | `/api/comments/:id` | Get a single comment |
| PUT | `/api/comments/:id/review` | Approve or reject a draft AI reply |
| POST | `/api/comments/:id/reply` | Manually reply to a comment |

## Architecture

- Comments are classified by the AI service into categories: `sales_inquiry`, `product_question`, `complaint`, `general`, etc.
- Lead scoring happens during classification (0-100 scale)
- Escalation scoring detects legal threats, harassment (score > 70 triggers escalation)
- Comments with `replyStatus: 'queued'` are picked up by the Comment Worker (BullMQ)
