# SafeTrack — student movement

Phase 9A adds **digital gate** events: RFID/NFC (or an admin test punch) records entry and exit, then the existing notification stack tells authorized parents.

```
STUDENT ID / CARD
        ↓
GATE READER (or admin test punch)
        ↓
POST /access/ingest  (device secret)
        ↓
MOVEMENT EVENT
        ↓
Student 360 (sibling GET)
        ↓
NotificationService → parent (IN_APP)
```

GPS, geofencing, route history, and SOS are **not implemented**. See [ADR-020](./adr/ADR-020-student-movement-safetrack.md).

---

## Event types

| Type | Parent notified? |
|------|------------------|
| `ENTRY` | yes |
| `EXIT` | yes |
| `UNKNOWN_CARD` | no |
| `DUPLICATE_SCAN` | no (same student, gate, and direction within 60s) |

`outsideSchedule` is a flag when the student has no scheduled class session that UTC day. It does not replace ENTRY/EXIT.

---

## API

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/access/ingest` | Device (`x-access-device-id`, `x-access-device-secret`) |
| `POST` | `/access/punch` | `INSTITUTION_ADMIN` test punch |
| `GET` | `/access/gates` | `INSTITUTION_ADMIN` |
| `GET` | `/access/today` | `INSTITUTION_ADMIN` (today only, this tenant) |
| `GET` | `/students/:id/movement` | Parent (linked), student (self), institution admin (tenant). Teacher / staff / super-admin **forbidden**. Foreign ids **404**. |

Ingest body: `{ uid, type?: "ENTRY"|"EXIT", occurredAt? }`. Recipients are never taken from the client.

Demo reader: device id `demo-access-device-a`, secret `DemoDeviceSecret!`, Aarav card `KC-AARAV-RFID`.

---

## Physical pilot setup (9A only)

One USB/Ethernet RFID reader at the institute entrance, mapped to one `AccessGate` + one device secret.

```
Gate reader
    ↓
POST /access/ingest
    ↓
KluCoach
    ↓
Movement event
    ↓
NotificationService
    ↓
Parent (if movementAlerts enabled)
```

Admin Gate test punch is the software substitute when hardware is not on site. Physical RFID installation remains **NOT VALIDATED — HARDWARE**. GPS and multi-gate 9B are **NOT IMPLEMENTED**.

---

## What this phase does not do

- Live GPS / last-known coordinates / maps
- Multiple named gates beyond seed `Main Gate` UI (schema already has `AccessGate` for 9B)
- SMS / WhatsApp
- SafeTrack billed add-on checkout
- Movement data in AI context
- Teacher campus live-location roster

---

## Privacy

Children's presence at a gate is restricted. 30-day parent-visible ENTRY/EXIT window. No public links. Not in ordinary search. Legal review is still required before commercial location (9C) launch.

Parent notification body uses the gate timestamp in UTC `HH:mm`, for example: `Aarav entered Demo Coaching Institute at 08:32.` It does not claim live location.
