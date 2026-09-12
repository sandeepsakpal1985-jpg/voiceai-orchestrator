# Shared production VPS — absolute rules for KluCaller deployment
#
# VPS: srv1822157.hstgr.cloud (KluKnow + KluCare + KluCaller additive)
# Cursor / operators: read this before any SSH automation.

This VPS is a **shared production host**. KluCaller must be deployed as an **additive service only**.

## ABSOLUTE RULES

- Never stop `klucare-*` containers.
- Never stop `kluknow-production-*` containers.
- Never recreate existing nginx.
- Never modify existing KluKnow/KluCare application containers.
- Never bind ports 80 or 443.
- Never install or start Caddy.
- Never expose PostgreSQL.
- Never expose Redis.
- Never expose Qdrant.
- Never expose Ollama.
- Never expose GPU inference services publicly.
- KluCaller application must initially bind only to **host port 8090 on 127.0.0.1**.
- LiveKit must remain **internal** during Phase 1.
- Before every configuration change, make a **backup**.
- **Phase 0 is strictly read-only.**
- **Do not proceed from Phase 1 to Phase 2 automatically.**
- **Do not proceed from Phase 2 to Phase 3 automatically.**
- Require **explicit approval** before modifying nginx configuration.
- If an existing service/network conflicts with KluCaller, **STOP and report** — do not change the existing service.

## Approved topology

```text
Internet
   │
   ▼
kluknow-production-nginx-1 (:80/:443)     ← Phase 3+ only
   │
   │ proxy_pass (after approval)
   ▼
KluCaller 127.0.0.1:8090 (Phase 1)        ← private first
   │
   ├── VoiceSession
   ├── ConversationEngine (brain — frozen)
   └── RAG

LiveKit — internal Docker network (Phase 1)
RunPod GPU — attach later (never on this VPS)
```

## Phase gates

| Phase | Action | Auto-proceed? |
|-------|--------|---------------|
| 0 | Inspect only (`docker ps`, `docker network ls`, `ss -lntup`, `df -h`) | — |
| 1 | Deploy KluCaller on `127.0.0.1:8090`; curl `/health/live` + `/health/ready` | **Stop here** until proven |
| 2 | DNS A record `klucaller` → VPS IP; verify resolution externally | **Stop** — no nginx/TLS yet |
| 3 | Review nginx snippet → TLS cert → `APPROVE_NGINX=1 ./scripts/vps_add_klucaller_nginx.sh` | **Explicit approval required** |
| 4 | Public QA → attach RunPod GPU → human voice test | Milestone |

## Status wording

KluCaller is **pilot-deployable / technically deployable**, not production-ready.

Unverified until public GPU-attached human voice test:

- Real OSS mic → STT → brain → TTS → speaker path
- Barge-in on public URL
- OSS TTFA targets
- Human 20-turn test

**Next milestone:** `klucaller.creamylane.com` reachable → RunPod GPU attached → you talk to KluCaller.
