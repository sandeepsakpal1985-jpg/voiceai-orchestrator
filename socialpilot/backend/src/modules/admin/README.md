# Admin Module — `/api/admin`

Admin-only endpoints for platform oversight. Requires JWT + admin role check.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/stats` | Aggregate usage statistics (users, connections, leads, etc.) |
| GET | `/api/admin/audit-log` | Paginated audit log with filtering by action/user |
| POST | `/api/admin/audit-log` | Create an audit log entry |
| GET | `/api/admin/users` | List all users with pagination and counts |

## Architecture

- All routes use `preHandler: [fastify.authenticate]` for JWT validation
- Admin role check happens inside each handler via `user.role === 'admin'`
- Audit log supports action and userId query filters
