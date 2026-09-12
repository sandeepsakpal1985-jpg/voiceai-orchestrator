# KluCaller V2 — pilot deploy sign-off

**Date:** 2026-09-12  
**Target:** `klucaller.creamylane.com` on VPS `srv1822157.hstgr.cloud`  
**Status:** **PILOT-DEPLOYABLE** — Phase 1 private deploy first; not production-ready

Full handoff: **[HOSTINGER_DEPLOY_HANDOFF.md](HOSTINGER_DEPLOY_HANDOFF.md)**  
Safety rules: **[deployment/VPS_SAFETY_RULES.md](../deployment/VPS_SAFETY_RULES.md)**

---

## What “ready” means (honest)

| Claim | Accurate? |
|-------|-----------|
| Pilot-deployable on Hostinger (additive, behind existing nginx) | **Yes** |
| Production-ready for paying customers | **No** |
| Real OSS mic → STT → brain → TTS → speaker verified | **No** |
| Human barge-in / OSS TTFA / 20-turn test on public URL | **No** |

**Next milestone:** `klucaller.creamylane.com` public → RunPod GPU attached → you talk to KluCaller.

---

## Architecture (approved)

```text
Hostinger: nginx + KluKnow + KluCare + KluCaller (CPU/control plane)
RunPod (later): faster-whisper + Qwen/Ollama + Kokoro
```

Phase 1: KluCaller on `127.0.0.1:8090`, LiveKit internal, WebSocket PCM.  
Phase 3+: existing nginx → `:8090` after explicit approval.

---

## Phase order (do not skip gates)

| Phase | Action | Auto-proceed? |
|-------|--------|---------------|
| 0 | `docker ps`, `docker network ls`, `ss -lntup`, `df -h` | Read-only |
| 1 | `./scripts/deploy_hostinger.sh` → curl health on `127.0.0.1:8090` | **Stop** until PASS |
| 2 | DNS A record; verify externally | **Stop** — no nginx |
| 3 | Review nginx snippet → cert → `APPROVE_NGINX=1` script | **Explicit approval** |
| 4 | Public QA → attach RunPod → human voice test | Milestone |

---

## QA performed (dev machine only)

| Check | Result |
|-------|--------|
| pytest | 62 passed |
| Docker CPU stack | healthy |
| `qa_smoke.ps1` | 9/9 PASS |
| Compose merge | OK |

---

## Artifacts

| File | Purpose |
|------|---------|
| `deployment/VPS_SAFETY_RULES.md` | Absolute rules for shared VPS |
| `deployment/docker-compose.hostinger.yml` | Phase 1 localhost bind |
| `scripts/deploy_hostinger.sh` | Phase 1 only; prints PASS/FAIL |
| `scripts/vps_add_klucaller_nginx.sh` | Requires `APPROVE_NGINX=1` |

Share SSH when ready for **Phase 0 inspection**.
