# Pilot metrics

Simple counts for the first institute. Do not build an analytics product.

Pull from existing tables and logs. No extra warehouse.

## Weekly snapshot (manual or SQL)

| Metric | Source |
|--------|--------|
| Students onboarded | `students` where `archivedAt` is null |
| Parents invited | `invitations` (parent role) |
| Parents activated | guardians with `userId` not null |
| Weekly active parents | distinct parent `userId` on `sessions` or notification reads in the last 7 days |
| In-app notifications created | `notifications` count in period |
| Attendance days marked | distinct `attendance_records.date` |
| Assessments published | `assessments` status PUBLISHED |
| Student 360 reads | API access log / audit if present; otherwise parent login count as proxy |
| Assignments created | `assignments` |
| Support tickets | external tracker (see feedback categories) |
| Invoices issued / paid | `billing_invoices` / `billing_payments` SUCCESS |
| SafeTrack ENTRY+EXIT | `movement_events` type in (ENTRY, EXIT) |

## Targets (planning, not SLAs)

First 30 days of a 100–500 student institute:

- Majority of enrolled students imported
- At least one parent activated per participating family that was invited
- Attendance used on teaching days
- At least one published test visible on Student 360
- Zero cross-tenant incidents

SafeTrack adoption is optional and counted only if hardware is live.

## What not to track

Live GPS, behavioral engagement scores, advertising funnels, per-child risk models.
