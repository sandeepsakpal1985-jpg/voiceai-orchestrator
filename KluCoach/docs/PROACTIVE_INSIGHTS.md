# Proactive student insights

Phase 8 adds **factual, rule-based** insights when domain data changes. Phase 7 answers questions when a user asks. Phase 8 tells authorized parents and students when a meaningful change is already observable.

```
DOMAIN CHANGE
     ↓
INSIGHT DETECTION (rules)
     ↓
FACTUAL INSIGHT
     ↓
EXISTING NotificationService
     ↓
PARENT / STUDENT (IN_APP)
```

AI is optional wording only. Detection never calls a model. `INSIGHT_AI_WORDING` defaults to `false`. The feature remains useful when `AI_ENABLED=false`.

See [ADR-019](./adr/ADR-019-proactive-student-insights.md).

---

## Insight types

| Type | Meaning | Source |
|------|---------|--------|
| `ATTENDANCE_DECLINE` | Attendance % fell by at least the configured threshold | previous vs current period percentages |
| `ATTENDANCE_IMPROVEMENT` | Attendance % rose by at least the threshold | same |
| `ACADEMIC_DECLINE` | Published assessment average fell by at least the threshold | previous vs current period averages |
| `ACADEMIC_IMPROVEMENT` | Published assessment average rose by at least the threshold | same |
| `ASSIGNMENT_OVERDUE` | Assignment `dueAt` is in the past and submission is not `SUBMITTED`/`REVIEWED` | assignment id + due date |

There is **no** risk score, dropout prediction, failure probability, behavior score, or “at risk” language.

---

## Detection rules

Comparable windows are UTC day-aligned. With `INSIGHT_PERIOD_DAYS=30` and `asOf=2026-09-05`:

- current: `2026-08-06` inclusive to `2026-09-05` exclusive
- previous: `2026-07-07` inclusive to `2026-08-06` exclusive
- `periodKey` = current window start date (`2026-08-06`)

Attendance % matches Student 360: `PRESENT` + `LATE` over all records in the window.

`|current − previous| < threshold` is trivial and produces no insight. Equal to the threshold **is** a change (94% → 86% with threshold 5 fires).

Minimum samples: `INSIGHT_MIN_ATTENDANCE_SAMPLES` (default 6) and `INSIGHT_MIN_RESULT_SAMPLES` (default 4). Thin samples produce no insight.

Example copy (deterministic):

- `Attendance decreased from 94% to 86%.`
- `Recent assessment average improved from 72% to 81%.`
- `Physics assignment is overdue.`

---

## Thresholds

| Variable | Default | Role |
|----------|---------|------|
| `INSIGHT_ATTENDANCE_CHANGE_PERCENT` | 5 | Attendance decline/improvement |
| `INSIGHT_ACADEMIC_CHANGE_PERCENT` | 5 | Assessment average decline/improvement |
| `INSIGHT_PERIOD_DAYS` | 30 | Length of each comparison window |
| `INSIGHT_MIN_ATTENDANCE_SAMPLES` | 6 | Per window |
| `INSIGHT_MIN_RESULT_SAMPLES` | 4 | Per window |
| `INSIGHT_AI_WORDING` | false | Optional LLM rephrase after the fact exists |

Do not hard-code product thresholds in application logic.

---

## Persistence and notifications

`student_insights` stores one row per `(institutionId, studentId, dedupeKey)`.

Dedupe keys:

- attendance / academic: `{TYPE}:{periodKey}`
- overdue: `ASSIGNMENT_OVERDUE:{assignmentId}`

Notifications reuse Phase 4 `deliverNotification`. Recipients are server-derived (`parentsForStudent`, `studentRecipient`). Never from the browser.

Notification dedupe: `{type}:{insightId}:{userId}` on the existing unique `(institutionId, userId, dedupeKey)`.

Preferences: attendance types use `attendanceAlerts`; academic types use `resultAlerts`; overdue uses `assignmentAlerts`. Channel is **IN_APP**. Email remains the existing optional port. SMS/WhatsApp are not required.

Worker retries and `POST /insights/run` must not create a second insight or a second notification for the same key.

---

## Job execution

| Path | Hour-key skip | Use |
|------|---------------|-----|
| `POST /insights/run` `{ asOf? }` | no | Admin on-demand / tests |
| `runStudentInsights()` | no | Event hooks and tests |
| Worker `student.insights` via `job_runs` | yes (UTC hour) | Production worker process |

The worker is the existing PostgreSQL job runner. No Redis, BullMQ, or extra broker.

Event hooks (same institution + student ids only):

- attendance saved → evaluate attendance windows for those students
- results published → evaluate academic windows for those students
- overdue assignments → periodic job (due date is not an immediate write event)

If the worker is **not** running, scheduled production execution is **not** claimed. The callable admin path still works.

---

## API

| Method | Path | Who |
|--------|------|-----|
| `GET` | `/students/:id/insights` | Same Student 360 relationship checks; **SUPER_ADMIN forbidden** |
| `GET` | `/insights/summary` | `INSTITUTION_ADMIN`, session tenant only |
| `POST` | `/insights/run` | `INSTITUTION_ADMIN`, session tenant only |

Parent: linked children only. Student: self only. Teacher: assigned-batch students. Admin: same tenant. Super-admin does not inherit student insight visibility.

---

## UI

- Parent and student home: **Recent insights** above Student 360. Clicking re-opens the authorized Student 360 route; the server authorizes again.
- Institution admin home: tenant counts for the current period (`N students had attendance declines greater than the configured threshold this period`).
- Teacher **batch aggregation dashboard** is deferred to Phase 9. Teachers can still `GET /students/:id/insights` for assigned students.

---

## Optional AI wording

When `INSIGHT_AI_WORDING=true` **and** `AI_ENABLED=true`, the already-created fact (title + source JSON) may be sent to `AiProvider` with `FACTUAL_INSIGHT_WORDING_V1`.

- Numbers must appear unchanged in the returned text
- Title stays deterministic
- Forbidden language (`at risk`, diagnoses, ability labels) is rejected
- Provider errors fall back to deterministic copy
- Default is off so proactive detection does not create uncontrolled LLM cost

This path does not use Student 360 context by default. It must not decide recipients and must not calculate percentages.

---

## Privacy

Store operational facts only (percentages, assignment id, due date, counts). Do not store behavioral profiles, mental-health inferences, intelligence labels, or hidden scores.

Audit actions: `insight.detected`, `insight.notification.created`, `insight.notification.delivered`, `insight.generation.failed`, `insight.job.requested`. Metadata is type/student id — not full source JSON or AI prompts.
