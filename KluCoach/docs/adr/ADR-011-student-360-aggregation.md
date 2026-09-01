# ADR-011 Student 360 aggregation

## Status

Accepted

## Context

Phases 1–2 proved tenant-safe academic workflows (attendance, assessments, timetable, assignments, notices, invitations). Parents still had to open several modules and mentally combine the picture.

Student 360 is the parent-facing product: one authorized read of the child’s current coaching situation. It must not duplicate domain tables, trust client-supplied `studentId` / `tenantId` / `parentId`, or invent insights with an LLM.

## Decision

1. **One aggregation function.** `assembleStudent360(institutionId, studentId)` reads existing attendance, results, assignment submissions, scheduled class sessions, notices, and the latest fee invoice. It does not copy those rows into a dashboard table.

2. **One HTTP contract.** `GET /students/:id/360` returns a Zod-validated `student360Schema` DTO. Parent home `GET /dashboard/parent` and student home `GET /dashboard/student` call the same assembler. The primary parent page does not waterfall per-domain list APIs.

3. **Authorization before assembly.** `assertStudent360Access` runs after session tenant binding:
   - Cross-tenant student id → **404** (`studentInTenant`)
   - PARENT → linked children only (**404** otherwise)
   - STUDENT → own row only (**404** otherwise)
   - TEACHER → enrollment in an assigned batch (**404** if unassigned, including same tenant)
   - INSTITUTION_ADMIN / STAFF / SUPER_ADMIN with tenant → in-tenant students
   Role checks stay in `scope.ts` / `policies.ts`, not ad-hoc controller `if` trees.

4. **Deterministic status, no AI.** `decideStudent360Status` in `student360-status.ts` uses documented thresholds. Possible values: `DOING_WELL`, `ON_TRACK`, `NEEDS_ATTENTION`, `INSUFFICIENT_DATA`. Empty academic and attendance data is `INSUFFICIENT_DATA` (never “Doing Well” or `0%`). Trends require minimum sample sizes; otherwise `INSUFFICIENT_DATA`.

5. **Multi-child.** One parent user may have many `StudentGuardian` links in the same institution. Parent home lists children (first name) and selects context via `?studentId=`. Foreign ids 404.

6. **No Student 360 cache in this phase.** Correctness and authorization outrank reuse. A future cache would need a tenant+role+student key and invalidation; cached payloads must never cross authorization boundaries.

7. **AI is an extension point, not this phase.** Later retrieval can sit on this DTO. It must not replace authorization or the status engine.

## Thresholds

| Input | Rule |
|-------|------|
| No attendance and no results | `INSUFFICIENT_DATA` |
| Attendance &lt; 75%, academic average &lt; 60%, ≥2 overdue, or declining academic trend | `NEEDS_ATTENTION` |
| Attendance ≥ 85% and academic average ≥ 75%, no overdue, not declining | `DOING_WELL` |
| Otherwise (including attendance-only) | `ON_TRACK` |
| Attendance trend | ≥6 records, split older/newer, ±5pp = stable |
| Academic trend | ≥4 results, same split and band |

These are operational coaching signals, not medical, psychological, or predictive diagnoses.

## Consequences

- Parent and student UIs share `Student360View`.
- Admin/teacher student detail reuses the same GET 360 read model; invitation CRUD is unchanged.
- Fees are read-only from existing invoices (`null` = not configured). No payment gateway.
- Viewing is audited as `student360.view` on the aggregation request, not per card render.
