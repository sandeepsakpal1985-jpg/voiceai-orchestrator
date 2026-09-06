# Pilot feedback

Lightweight intake for the first institute. Not a CRM.

## Record

| Field | Content |
|-------|---------|
| Date | |
| Institute | |
| Reporter role | admin / teacher / parent / student / KluNex |
| Category | **BUG** / **UX ISSUE** / **FEATURE REQUEST** / **COMMERCIAL REQUEST** |
| Severity | **P0** / **P1** / **P2** / **P3** (see below) |
| Affected workflow | onboarding / import / invitation / attendance / assessment / assignment / Student 360 / notifications / billing / SafeTrack / other |
| Affected users | count or role |
| Frequency | once / daily / always |
| Reproducibility | steps |
| Status | open / investigating / resolved / deferred |
| Owner | |
| Resolution | |
| Description | what happened vs expected |
| Proposed action | fix / document / defer to roadmap |

## Severity

| Level | Meaning |
|-------|---------|
| **P0** | Security, data loss, or system unusable |
| **P1** | Major workflow blocked (cannot take attendance, cannot activate parents, cannot log in) |
| **P2** | Workflow degraded (awkward, slow, missing copy, partial import confusion) |
| **P3** | Cosmetic / minor |

Legacy labels blocker / high / medium / low map to P0–P3.

## Rules

- Do not paste passwords, session tokens, device secrets, RFID UIDs, or payment payloads into the ticket.
- Movement reports: gate name + timestamp is enough; do not attach live location (GPS is not in the product).
- GPS, chat, video class, marketplace, and school-bus tracking stay on [ROADMAP.md](./ROADMAP.md).
