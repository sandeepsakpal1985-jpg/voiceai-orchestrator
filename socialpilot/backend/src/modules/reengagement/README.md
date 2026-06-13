# Re-engagement Module — `/api/reengagement`

Automated re-engagement campaigns for dormant leads. Configurable 24h/3d/7d follow-up sequences.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reengagement/rules` | Get re-engagement rules (creates defaults if none exist) |
| PUT | `/api/reengagement/rules` | Update re-engagement rules |
| GET | `/api/reengagement/candidates` | List dormant leads eligible for re-engagement |

## Architecture

- Rules define timing intervals (24h, 3d, 7d) and message templates
- `GET /candidates` queries leads with `lastContactAt` older than the configured intervals
- Re-engagement Worker (BullMQ) processes follow-up sequences asynchronously
- The 7d stage is treated as the final check-in message
