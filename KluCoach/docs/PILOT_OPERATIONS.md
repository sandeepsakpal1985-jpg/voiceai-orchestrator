# Pilot operations

How to onboard one coaching institute, run daily work, and support the pilot. This is not a second product — it uses the Phase 10 system.

GPS, SafeTrack 9B, chat, and advanced AI stay on [ROADMAP.md](./ROADMAP.md).

---

## Onboarding

Institution admin home (`/admin`) shows **KluCoach Setup** from live database counts (not a fake wizard).

| Step | Done when |
|------|-----------|
| Institution | Tenant exists (always true after login) |
| Branch | ≥1 branch |
| Programs | ≥1 program |
| Batches | ≥1 batch |
| Teachers | ≥1 teacher |
| Students | ≥1 active student |
| Parents | ≥1 guardian |
| Parent activation | ≥1 guardian with a user account |
| Timetable | ≥1 timetable slot |
| First attendance | ≥1 attendance row |
| First assessment | ≥1 assessment |

Progress is `complete / 11`. Open an incomplete row to the existing screen for that work.

Typical order for a new institute:

1. Create institution + admin (platform)
2. Branch → programs → subjects → batches
3. Add teachers; import students (CSV/XLSX, max 2,000 rows)
4. Link parents; send invitations; parents activate
5. Timetable; mark attendance; create a first assessment
6. Confirm notification preferences; optional SafeTrack gate
7. Confirm subscription on Billing (invoices visible; **live payments stay off** until cutover)

---

## Daily operation

| Role | Path |
|------|------|
| Admin | Setup checklist, students/import, notices, billing invoices, Gate test punch |
| Teacher | Assigned batches → today's attendance → assessments/marks → assignments |
| Parent | Student 360 home, notifications + preferences, attendance history, fees status, movement if SafeTrack is on |
| Student | Own 360, assignments submit |
| Super-admin | `/commercial` — partner economics **and** pilot operation counts (including last activity timestamp). No student-name dump. System health remains `GET /health` and `GET /ready`. |

Teachers cannot open billing or another tenant. Parents cannot subscribe another user to alerts.

---

## Parent activation

1. Import or create student with guardian email
2. Student detail → Create invitation
3. Parent opens accept URL and sets a password
4. Parent sees only linked children

Track invitations created / accepted / expired on super-admin **Pilot operations**. SMS/WhatsApp are not product channels in this phase.

---

## SafeTrack 9A (RFID only)

Physical path for a single gate:

```
Gate reader
    ↓
POST /access/ingest
  (x-access-device-id, x-access-device-secret)
    ↓
KluCoach movement event (ENTRY / EXIT / UNKNOWN_CARD / DUPLICATE_SCAN)
    ↓
NotificationService (if ENTRY/EXIT and parent has movementAlerts)
    ↓
Parent Student 360 + inbox
```

Do not put raw card UIDs or device secrets in tickets. GPS is not implemented. Parent copy is factual clock time in UTC (`HH:mm`), for example: `Aarav entered Demo Coaching Institute at 08:32.`

---

## Troubleshooting

Operator first checks: `GET /health` (process) then `GET /ready` / `GET /readiness` (database). Every API error includes `error.requestId`. Structured JSON logs go to stdout. Do not paste session cookies, CSRF tokens, or device secrets into chat.

| Symptom | Inspect |
|---------|---------|
| Application unavailable | `GET /health`. If it fails, the API process/container is down. Check Compose `api` logs, `APP_ENV`, session secret, CORS, cookie Secure. Restart `api` after config is valid. |
| Database unavailable | `GET /ready` fails while `/health` may still be 200. Check Postgres is up, `DATABASE_URL`, and disk. Do not drop the source database. |
| Worker stopped | Compose `worker` logs. Hourly jobs are `billing.lifecycle`, `payment.reconcile`, and `student.insights`. If the worker is stopped they do not run; super-admin can still `POST /billing/lifecycle/apply`, `POST /billing/reconciliation/run`, and `POST /insights/run`. |
| Notification failure | Confirm the intended event was created (`notifications` row / inbox). Preference suppression and 60s SafeTrack dedupe are not failures. SMTP delivery is **BLOCKED — EXTERNAL PROVIDER** until live mail is configured. |
| Payment reconciliation issue | Super-admin `POST /billing/reconciliation/run` and `GET /billing/reconciliation`. Live Razorpay is **BLOCKED — EXTERNAL PROVIDER**. Production default remains `PAYMENTS_ENABLED=false`. |
| Import failure | Preview errors (row-level). Cap 2,000 rows. Tenant-scoped branch/batch names. Partial import commits only valid rows; malformed rows do not silently update unrelated records. |
| SafeTrack ingest failure | Device id/secret headers, card assignment, `UNKNOWN_CARD` / `DUPLICATE_SCAN`. Admin Gate test punch is the software substitute. Physical RFID remains **NOT VALIDATED — HARDWARE**. |

---

## Support escalation

Use [PILOT_FEEDBACK.md](./PILOT_FEEDBACK.md) (P0–P3). P0 (security, data loss, system unusable) goes to KluNex immediately. Do not grant unrestricted “god mode.” Super-admin sees counts and billing, not another institute’s student 360 by browsing IDs (those remain 404).

---

## Backup / restore

Copy-database restore only. Never drop the source. See [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md) and `scripts/verify-backup.ps1`.

---

## Pilot metrics and success criteria

Targets (not current performance claims) live in [PILOT_METRICS.md](./PILOT_METRICS.md). Super-admin `GET /pilot/metrics` and the Commercial page **Pilot operations** table.
