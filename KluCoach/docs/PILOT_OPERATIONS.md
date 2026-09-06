# Pilot operations

How to onboard one coaching institute, run daily work, and support the pilot. This is not a second product — it uses the Phase 10 system.

GPS, SafeTrack 9B, chat, and advanced AI stay on [ROADMAP.md](./ROADMAP.md).

---

## Onboarding

Institution admin home (`/admin`) shows **KluCoach Setup** from live database counts (not a fake wizard).

| Step | Done when |
|------|-----------|
| Institution profile | Tenant exists (always true after login) |
| Branch | ≥1 branch |
| Programs | ≥1 program |
| Batches | ≥1 batch |
| Teachers | ≥1 teacher |
| Students | ≥1 active student |
| Parent links | ≥1 guardian |
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
| Super-admin | `/commercial` — partner economics **and** pilot operation counts. No student-name dump. |

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

Do not put raw card UIDs or device secrets in tickets. GPS is not implemented.

---

## Troubleshooting

| Symptom | Inspect |
|---------|---------|
| App down | `GET /health` then `GET /ready` (alias `GET /readiness`) |
| Login fails | API logs (`requestId`), session cookie Secure/CORS, lockouts |
| Import rejected | Row cap 2,000; preview errors; tenant-scoped branch/batch names |
| Parent sees no child | Guardian link; invitation accepted; wrong tenant email |
| No absence alert | Parent **Attendance alerts** preference; server prefs are authoritative |
| Invoice but cannot pay | `PAYMENTS_ENABLED=false` is the production default |
| Gate silent | Device id/secret, card assignment, `UNKNOWN_CARD` / `DUPLICATE_SCAN` |
| Worker stale | Billing lifecycle + payment reconciliation jobs; notification purge is callable, not a silent untested cron |

Every API error includes `error.requestId`. Do not paste session cookies, CSRF tokens, or device secrets into chat.

---

## Support escalation

Use [PILOT_FEEDBACK.md](./PILOT_FEEDBACK.md) (P0–P3). P0 (security, data loss, system unusable) goes to KluNex immediately. Do not grant unrestricted “god mode.” Super-admin sees counts and billing, not another institute’s student 360 by browsing IDs (those remain 404).

---

## Backup / restore

Copy-database restore only. Never drop the source. See [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md) and `scripts/verify-backup.ps1`.

---

## Pilot metrics and success criteria

Targets (not current performance claims) live in [PILOT_METRICS.md](./PILOT_METRICS.md). Super-admin `GET /pilot/metrics` and the Commercial page **Pilot operations** table.
