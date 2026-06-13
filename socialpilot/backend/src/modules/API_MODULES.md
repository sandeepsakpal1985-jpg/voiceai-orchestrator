# SocialPilot Backend — API Modules

This document provides an overview of all 16 API modules in the backend.

Each module is a Fastify plugin registered under `/api/<module>`.

---

## 1. Auth — `/api/auth`

Handles user registration, login, JWT issuance, and Google OAuth.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register a new user (email + password) |
| POST | `/login` | Login with email + password, returns JWT |
| GET | `/me` | Get the current user's profile (requires JWT) |
| POST | `/google` | Google OAuth ID token verification, creates/links user |

---

## 2. Admin — `/api/admin`

Admin-only endpoints for platform oversight.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Aggregate usage statistics (users, connections, leads, etc.) |
| GET | `/audit-log` | Paginated audit log with filtering by action/user |
| POST | `/audit-log` | Create an audit log entry |
| GET | `/users` | List all users with pagination and counts |

---

## 3. Meta (Instagram/Facebook) — `/api/meta`

OAuth integration with Meta's Graph API for Instagram & Facebook.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth` | Initiate OAuth — redirects to Meta's OAuth dialog |
| GET | `/callback` | OAuth callback — exchanges code for long-lived token, fetches pages |
| GET | `/connections` | List the user's Meta connections |
| DELETE | `/connections/:id` | Remove a Meta connection |
| POST | `/refresh-token` | Exchange existing token for a new long-lived token |
| GET | `/webhook` | Meta webhook verification (GET challenge) |
| POST | `/webhook` | Meta webhook event handler |

---

## 4. Comments — `/api/comments`

Manage Instagram/Facebook comments.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List comments (paginated, filterable by status) |
| GET | `/:id` | Get a single comment |
| PUT | `/:id/review` | Approve or reject a draft AI reply |
| POST | `/:id/reply` | Manually reply to a comment |

---

## 5. DMs — `/api/dms`

Manage DM conversations from Instagram/Messenger.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List conversations (paginated, filterable by status) |
| GET | `/:id` | Get a conversation with all messages |
| POST | `/:id/messages` | Send a message in a conversation |

---

## 6. CRM — `/api/crm`

Pipeline deal management with Kanban-style stage groupings.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all deals grouped by pipeline stage |
| GET | `/:id` | Get a deal with lead info and activity timeline |
| PUT | `/:id/stage` | Move a deal to a different pipeline stage |
| PUT | `/:id` | Update deal fields (title, value, notes, follow-up) |
| POST | `/:id/activities` | Add an activity log entry to a deal |

---

## 7. Leads — `/api/leads`

Lead management with scoring, filtering, and CRM deal conversion.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List leads (paginated, filterable by category/search) |
| GET | `/:id` | Get a lead with its CRM deal and customer memory |
| PUT | `/:id` | Update lead details |
| POST | `/:id/convert` | Convert a lead into a CRM deal |
| GET | `/export` | Export all leads as a flat list |

---

## 8. CTA — `/api/cta`

Call-to-action configuration for automated DM suggestions.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all CTAs |
| POST | `/` | Create a new CTA |
| PUT | `/:id` | Update a CTA |
| DELETE | `/:id` | Delete a CTA |

---

## 9. Knowledge — `/api/knowledge`

Knowledge base documents (FAQ, products, policies, etc.) for AI responses.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List documents |
| GET | `/:id` | Get a document's full content |
| POST | `/` | Create a document |
| PUT | `/:id` | Update a document |
| DELETE | `/:id` | Delete a document |
| POST | `/upload` | File upload (coming soon — Supabase Storage) |

---

## 10. Inbox — `/api/inbox`

Unified inbox for managing comments + DMs in one place.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List inbox items (paginated, filterable by status/priority/type) |
| GET | `/:id` | Get item details (marks as read) |
| PUT | `/:id/note` | Update internal note |
| PUT | `/:id/assign` | Assign item to a team member |
| PUT | `/:id/status` | Update item status |

---

## 11. Notifications — `/api/notifications`

In-app notification system.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List notifications (filterable: all or unread only) |
| GET | `/unread-count` | Get count of unread notifications |
| PUT | `/:id/read` | Mark a notification as read |
| PUT | `/read-all` | Mark all notifications as read |
| POST | `/` | Create a notification (internal use) |

---

## 12. Escalation — `/api/escalation`

Handle escalated conversations that require human intervention.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List escalation tickets (filterable by status) |
| GET | `/:id` | Get a ticket's details |
| PUT | `/:id` | Update ticket (status, assignment, resolution) |

---

## 13. Onboarding — `/api/onboarding`

Multi-step onboarding flow for new users.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get current onboarding status |
| PUT | `/step` | Advance to the next onboarding step |
| POST | `/complete` | Complete onboarding (saves personality, CTA, flags as done) |

---

## 14. Team — `/api/team`

Team member management with role-based access.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List team members |
| POST | `/invite` | Invite a user to the team |
| PUT | `/:id` | Update a member's role |
| DELETE | `/:id` | Remove a team member |

---

## 15. Re-engagement — `/api/reengagement`

Automated re-engagement campaigns for dormant leads.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rules` | Get re-engagement rules (creates defaults if none exist) |
| PUT | `/rules` | Update re-engagement rules |
| GET | `/candidates` | List dormant leads eligible for re-engagement |

---

## 16. Analytics — `/api/analytics`

Dashboard analytics and AI-generated insights.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/overview` | Dashboard overview metrics (comments, DMs, leads, deals) |
| GET | `/leads` | Lead metrics by category and source |
| GET | `/growth` | Daily lead growth over the last 30 days |
| GET | `/insights` | Get stored AI insights for a period |
| POST | `/insights/generate` | Generate fresh AI insights from conversation data |

---

## Middleware

All routes (except auth endpoints and webhooks) are protected by JWT authentication via `fastify.authenticate`.
