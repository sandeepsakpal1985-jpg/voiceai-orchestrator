# Pilot checklist

Use for the first paid coaching institute. Unchecked items are not implied complete.

## Business

- [ ] Institution agreement signed
- [ ] List price confirmed (core ₹999/student/year configuration; SafeTrack add-on not a live SKU)
- [ ] Billable student count confirmed
- [ ] Billing period confirmed
- [ ] Payment terms confirmed (manual invoice until Razorpay cutover)
- [ ] DPDP / contract privacy review scheduled (engineering docs are not legal sign-off)
- [ ] GST treatment reviewed by accountant if invoices will be GST-bearing

## Technical

- [ ] Domain pointed at the VPS
- [ ] HTTPS working (`COOKIE_SECURE=true`, https `PUBLIC_APP_URL`)
- [ ] Postgres reachable; `migrate:deploy` applied (not `db push`)
- [ ] Daily backup + one restore drill on a copy (`scripts/verify-backup.ps1`)
- [ ] `/health` and `/ready` monitored
- [ ] SMTP configured **or** explicitly deferred (IN_APP still works)
- [ ] Payment provider off unless keys + webhook are live
- [ ] `ALLOW_DEV_RESET_TOKEN=false`
- [ ] Demo `@example.test` accounts absent from production
- [ ] Log redaction verified (no session/device secrets)

## Product

- [ ] Super-admin created out of band
- [ ] Institution + branch + academic year + program + batches
- [ ] Admin user can log in
- [ ] Student CSV/Excel import trial (malformed rows reported, no silent corruption)
- [ ] Parent invitation + activation
- [ ] Teacher assigned to batches
- [ ] Attendance save + parent Attendance page
- [ ] Assessment marks + parent Student 360
- [ ] Notices
- [ ] In-app notifications
- [ ] Institution billing invoices visible to admin (not to parents)

## Optional SafeTrack

- [ ] Institution wants entry/exit (not GPS)
- [ ] RFID cards sourced
- [ ] Gate reader installed
- [ ] Device id + secret provisioned (hash at rest)
- [ ] One successful ingest or admin test punch
- [ ] Parent sees ENTRY/EXIT for a linked child only
- [ ] Teachers do not receive live movement

## Explicitly out of this pilot

GPS, multiple named gates UI, SMS/WhatsApp, live AI wording, Razorpay until cutover, KluSchool/KluCollege mode.
