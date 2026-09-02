# ADR-012 Notification engagement

## Status

Accepted

## Context

Phase 3 made Student 360 the parent/student read model. Phase 4 needs targeted institutional communication so parents do not have to poll every module. ADR-006 already defined **channel ports**. This ADR covers **events, recipients, authorization, deduplication, retention, and privacy**.

We are not building a chat product, a message bus, or fake SMS/WhatsApp.

## Decision

### Event model

Domain writes emit **meaningful product events**, not raw row-change hooks:

| Event | When | Default parent | Default student |
|-------|------|----------------|-----------------|
| `ATTENDANCE_ABSENCE` | Attendance saved as `ABSENT` | yes | no |
| `ASSESSMENT_RESULT_PUBLISHED` | Results saved (`POST /assessments/:id/results` publishes the assessment) | yes | yes |
| `ASSIGNMENT_CREATED` | Assignment created | yes (child named in body) | yes |
| `NOTICE_PUBLISHED` | Notice created | yes, if child is in audience | yes, if in audience |
| `TIMETABLE_CHANGED` | Session date/time/room/status/batch changed | yes | yes |

Attendance `PRESENT` and `EXCUSED` do not notify. `LATE` is not notified by default (not configurable in MVP UI). Result edits reuse the same assessment+student dedupe key so republishing marks does not spam.

### Recipients

Calculated **server-side** from tenant + relationships. Clients cannot POST a recipient list.

- Parents: `StudentGuardian` rows whose guardian has a `userId` in the same institution
- Students: the student's own user, if linked
- Notice audience: INSTITUTION / BRANCH / BATCH / STUDENTS → enrolled students → parents + student users
- Cross-tenant: never. Session `institutionId` is the only tenant handle

### Notification model

Durable `Notification` rows: tenant, recipient user, optional student context, type, title, body, href, readAt, dedupeKey. List/get always filter `institutionId + userId` from the session. Foreign ids → **404**. There is no client create endpoint.

Deep links are ordinary app routes (`/parent?studentId=`, `/student`, `/assignments`, `/notices`, `/timetable`). Destination pages re-run authorization. The href is not a capability token.

### Deduplication

Unique `(institutionId, userId, dedupeKey)`. Keys include event type, resource, date/session, and recipient:

- absence: `ATTENDANCE_ABSENCE:{tenant}:{student}:{date}:{session}:{user}:{student}`
- result: `ASSESSMENT_RESULT_PUBLISHED:{tenant}:{assessment}:{student}:{user}:{student}`
- assignment / notice: type + resource + user + student
- timetable: session id + new date/time/room/status

Retries and double-saves return the existing row (`findUnique` then `P2002` catch).

### Channels

| Channel | Status |
|---------|--------|
| IN_APP | Implemented and executed |
| EMAIL | Port exists. Sends only when `SMTP_HOST` is set; current transport logs title only, no student marks. **Not executed as live SMTP in this phase** |
| SMS / WhatsApp / Push | Interface only. Not instantiated for delivery |

No Kafka, Redis Streams, or notification framework. `NotificationService.deliverNotification` is the single write path.

### Preferences

`NotificationPreference` per user: attendance/result/assignment/notice/timetable alerts (default on), fee alerts (default off), in-app and email channel flags. Preferences are not a security boundary — list authorization still uses session user id.

### Retention

Default 90 days (`NOTIFICATION_RETENTION_DAYS`). `purgeExpiredNotifications` deletes old **notification** rows only. It does not touch `AuditLog`. It is **callable, not scheduled**. Production must invoke it from a job runner.

### Privacy

Copy is short: child first name + event, no marks, no passwords, no tokens, no internal ids in email bodies. Email URLs are not used as auth.

### Jobs not claimed

`runAssignmentReminders` returns `{ scheduled: false }`. Due-soon / overdue reminders are **NOT IMPLEMENTED**. Fee due notifications are **NOT IMPLEMENTED**.

## Consequences

- Parents get actionable in-app alerts that open the correct child context
- Teachers still use existing notice/attendance/result screens; no notification admin console
- Demo data (including Diya) can accumulate attendance from e2e; empty-state tests must create their own student
