# Leads Module — `/api/leads`

Lead management with scoring, categorization, filtering, and CRM deal conversion.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads` | List leads (paginated, filterable by category/search) |
| GET | `/api/leads/:id` | Get a lead with its CRM deal and customer memory |
| PUT | `/api/leads/:id` | Update lead details |
| POST | `/api/leads/:id/convert` | Convert a lead into a CRM deal |
| GET | `/api/leads/export` | Export all leads as a flat list |

## Architecture

- Categories: `cold` (0-30), `warm` (31-60), `hot` (61-85), `vip` (86-100)
- Lead scores are computed by the AI classifier during comment/DM processing
- Tags system supports flexible lead labeling (e.g., `bulk_buyer`, `demo_request`)
- Source tracking: `comment`, `dm`, `manual`, `import`
