# Team Module — `/api/team`

Team member management with role-based access control.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/team` | List team members |
| POST | `/api/team/invite` | Invite a user to the team |
| PUT | `/api/team/:id` | Update a member's role |
| DELETE | `/api/team/:id` | Remove a team member |

## Architecture

- Roles: `owner` (full access), `admin` (manage team + settings), `sales_agent` (comment/DM management), `support_agent` (inbox only)
- Only `owner` and `admin` can invite/manage team members
- Team invitations create a pending `TeamMember` record — the invited user must accept
