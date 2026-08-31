# ADR-006 Notification architecture

## Status

Accepted

## Context

Channels: in-app, email, SMS, WhatsApp. Spec forbids hard-coding a vendor. ₹500/student economics forbids blasting SMS by default.

## Decision

`NotificationProvider` port. MVP implements `IN_APP` always and `EMAIL` when SMTP/API env is set (otherwise log). SMS/WhatsApp: interface + `NotConfiguredProvider`.

## Consequences

- Product works without Twilio/WhatsApp cost
- Institutions can enable paid channels later on their bill
