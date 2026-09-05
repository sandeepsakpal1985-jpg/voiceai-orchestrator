# ADR-020 Student Movement & SafeTrack

## Status

Accepted

## Context

Phase 8 delivers factual insights from academic records. Parents also want to know **when a child entered or left the institute**. Continuous GPS on every ID card would add hardware, SIMs, batteries, and a children's-location data business KluCoach is not ready to operate.

RFID/NFC punch at a gate gives entry, exit, timestamp, device, and parent notification at a fraction of that complexity. The same event pipeline can accept GPS later without a second student graph.

## Decision

1. **RFID-first (Phase 9A).** Persist `AccessGate`, `AccessDevice`, `StudentCredential`, and `MovementEvent`. No latitude/longitude columns. GPS, geofence, route history, and SOS are **Phase 9C** and must not ship in this phase.
2. **Reuse NotificationService.** `MOVEMENT_ENTRY` / `MOVEMENT_EXIT` go to **parents only**, server-derived. Students are not spammed with their own punches. Teachers do not receive live movement.
3. **Device ingest is not a user session.** `POST /access/ingest` authenticates `x-access-device-id` + `x-access-device-secret` (Argon2id hash at rest). CSRF is skipped like payment webhooks. Institution comes from the device row, never from the body.
4. **Authorization is stricter than Student 360.** Parent: linked children. Student: self. Institution admin: tenant student + today's gate log. Teacher, staff, and super-admin do **not** inherit movement history. Cross-tenant IDs stay **404**.
5. **Facts only.** Parent copy is “entered / left {institute}”. No “at risk”, no live map, no last-known GPS in 9A.
6. **Retention.** Parent-visible history is the last 30 days of ENTRY/EXIT. Duplicate scans within 60 seconds at the same gate do not notify.
7. **No new queue, map SDK, or GPS vendor.** Admin test punch exists so CI does not need a physical reader.
8. **Commercial add-on is documented, not billed in 9A.** Core remains ₹999/student/year configuration. SafeTrack RFID/GPS list prices stay in [BILLING.md](../BILLING.md) as planning figures until a plan snapshot exists.

## Consequences

- Gate punch works without AI, SMS, WhatsApp, or GPS.
- Location pings, if added later, need a separate table, guardian opt-in, and must stay out of default AI context.
- Hardware readers, cards, and OEM quotes are outside this software slice.
