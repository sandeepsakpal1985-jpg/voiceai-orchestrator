# Pilot metrics

Simple counts for the first institute. Do not build an analytics product.

Pull from existing tables. No extra warehouse.

**These are pilot targets, not claims of current performance.** They are documented here so a real institute run can be compared. They are not hard-coded business gates.

## Success targets (first controlled institute)

| Metric | Target |
|--------|--------|
| Parent activation (guardians with a user / guardians linked) | > 70% |
| Parent weekly engagement (distinct parents who read a notification in 7 days) | > 50% |
| Attendance usage (active teaching days with at least one save) | > 80% |
| Assessment usage | ≥ 1 assessment / month for active batches |
| In-app notification creation success | > 95% of intended events created (dedupe and preference suppression are not failures) |
| Critical security failures | 0 |
| Cross-tenant leakage | 0 |
| Unresolved critical/high defects | 0 |

SafeTrack adoption is optional and counted only if a gate is configured.

## Super-admin API

`GET /pilot/metrics` — `SUPER_ADMIN` only. Institution admins receive **403**. Payload is counts (students, teachers, parents, invitations, attendance days, assessments, assignments, notices, notifications, SafeTrack events) plus commercial totals. **No student names.**

KluNex realization and partner share remain super-admin only (`GET /billing/report` and this metrics payload). Institution `GET /billing/subscription` returns list price + gross only.

## Weekly snapshot (SQL still valid)

| Metric | Source |
|--------|--------|
| Students onboarded | `students` where status is ACTIVE |
| Parents invited | `invitations` type PARENT |
| Parents activated | guardians with `userId` not null |
| Weekly active parents | distinct parent `userId` on notification reads in the last 7 days |
| In-app notifications created | `notifications` count |
| Attendance days marked | distinct `attendance_records.date` |
| Assessments created | `assessments` |
| Assignments created | `assignments` |
| Notices created | `notices` |
| Invoices issued / paid | `billing_invoices` / payments SUCCESS |
| SafeTrack ENTRY+EXIT | `movement_events` type in (ENTRY, EXIT) |

## What not to track

Live GPS, behavioral engagement scores, advertising funnels, per-child risk models.
