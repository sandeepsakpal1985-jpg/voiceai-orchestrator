# Progress

Updated: 2026-09-01 (Phase 1 security boundary)

Validation rule: COMPLETE only with execution evidence.

| Feature | Status | Tests | Verified | Notes |
|---------|--------|-------|----------|-------|
| Locked foundation `47d1989` | VALIDATED | n/a | git | OSS checkpoint; not rebuilt |
| Student isolation | VALIDATED | vitest | yes | GET by id → 404 |
| Parent isolation | VALIDATED | vitest | yes | Child id + GET `/parents/:id` |
| Attendance isolation | VALIDATED | vitest | yes | studentId + batchId |
| Results isolation | VALIDATED | vitest | yes | studentId + assessmentId |
| Search isolation | VALIDATED | vitest | yes | No other-tenant strings |
| Teacher isolation | VALIDATED | vitest boundary | yes | GET/PATCH, search, foreign batchIds |
| Assignment isolation | VALIDATED | vitest boundary | yes | GET by id, batch filter, create |
| Notice isolation | VALIDATED | vitest boundary | yes | GET by id, targeted POST |
| Report / CSV export isolation | VALIDATED | vitest CSV body | yes | students, attendance, parent-activation |
| Invitation tenant isolation | VALIDATED | vitest | yes | Foreign studentId → 404 |
| Auth throttling config | VALIDATED | unit + identical 401 | yes | Live 429 not run in Vitest |
| Query tenant-scope | VALIDATED | write-path helpers | yes | Admin batch skip + FK ids fixed |
| Institution (tenant) | VALIDATED | existing + /me | yes | No duplicate Institution table |
| Branch / program / subject / batch | VALIDATED | GET by id 404 | yes | Configurable; tenant-owned |
| Teacher / student / parent domain APIs | VALIDATED | isolation + RBAC | yes | PATCH teacher; student archive via status |
| Password reset | NOT STARTED | | | No endpoints |
| Playwright admin create-branch workflow | NOT STARTED | | | Deferred per Phase 1 prompt |
| Production deployment | NOT STARTED | | | BLOCKED — no production host |

## Session summary (Phase 1)

1. **Starting commit:** `47d1989`
2. **Security gaps found:** admin skip of batch ownership; create/filter paths accepting foreign FKs; invitations accepting foreign student/guardian/teacher ids; query filters returning empty instead of 404
3. **Security gaps fixed:** `*InTenant` helpers; `assertTeacherBatchAccess` always checks batch tenant; invitation create/accept checks; generic login-failure audit
4. **Tests executed:** Vitest (isolation + boundary + import + RBAC + rate-limit config)
5. **Tests blocked:** none for Vitest. Playwright not re-run this phase
6. **Security gate:** PASS — see docs/SECURITY_GATE_PHASE1.md
7. **Exact next step:** Playwright for parent invitation activation + assessment marks entry; then remaining admin lists on DataTable
