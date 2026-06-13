# CRM Module — `/api/crm`

Pipeline deal management with Kanban-style stage groupings. Tracks deals from lead through to won/lost.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/crm` | List all deals grouped by pipeline stage |
| GET | `/api/crm/:id` | Get a deal with lead info and activity timeline |
| PUT | `/api/crm/:id/stage` | Move a deal to a different pipeline stage |
| PUT | `/api/crm/:id` | Update deal fields (title, value, notes, follow-up) |
| POST | `/api/crm/:id/activities` | Add an activity log entry to a deal |

## Architecture

- 8 pipeline stages: `new_lead` → `contacted` → `qualified` → `demo_scheduled` → `proposal_sent` → `negotiation` → `won` / `lost`
- `GET /` returns deals grouped by stage for easy Kanban rendering
- Each deal links to a `Lead` via `leadId` (optional, unique)
- Activities track deal history (calls, emails, notes, stage changes)
