# KluCaller V2 — Hostinger deployment handoff

**Target:** `klucaller.creamylane.com` on VPS `srv1822157.hstgr.cloud` (`200.97.168.59`)  
**Status:** **Pilot-deployable** — Phase 1 private deploy first; no nginx until approved

**Safety rules (mandatory):** [`deployment/VPS_SAFETY_RULES.md`](../deployment/VPS_SAFETY_RULES.md)

This VPS is a **shared production host** (KluKnow + KluCare + KluCaller additive). KluCaller is **technically deployable**, not production-ready, until a public GPU-attached human voice test passes.

---

## Approved topology

```text
Internet
   │
   ▼
kluknow-production-nginx-1          Phase 3+ only
       :80/:443
          │
          │ proxy_pass
          ▼
     KluCaller 127.0.0.1:8090       Phase 1 (private)
          │
          ├── VoiceSession
          ├── ConversationEngine
          └── RAG

     LiveKit — internal (Phase 1)
     RunPod GPU — attach later (never on Hostinger)
```

First boot: **WebSocket PCM** (`KLUCALLER_LIVEKIT_AUDIO=0`) — no LiveKit UDP/public ports.

---

## Phase gates (strict order)

### Phase 0 — VPS inspection (read-only)

Run **only**:

```bash
docker ps
docker network ls
ss -lntup
df -h
```

Look for: existing nginx container/network, suggested install path (e.g. `/opt/klucaller-v2`), whether **8090** is free, disk headroom, Docker networks nginx uses.

**Do not modify anything.**

---

### Phase 1 — KluCaller private deployment

Deploy on **`127.0.0.1:8090`** only:

```bash
cd /opt/klucaller-v2
cp deployment/env.hostinger.example .env
chmod +x scripts/deploy_hostinger.sh
./scripts/deploy_hostinger.sh
```

Verify **independently of nginx**:

```bash
curl -sf http://127.0.0.1:8090/health/live
curl -sf http://127.0.0.1:8090/health/ready
```

**Gate:** script must print `PHASE 1 PASS`. Do not expose publicly. Do not touch nginx.

---

### Phase 2 — DNS (manual)

Create:

```text
klucaller.creamylane.com  A  →  200.97.168.59
```

Verify resolution **from outside the VPS**. Do not proceed to Phase 3 automatically.

---

### Phase 3 — TLS + nginx (explicit approval required)

**Before** running any nginx script, inspect [`deployment/nginx-klucaller.inc.conf`](../deployment/nginx-klucaller.inc.conf) and confirm it:

- Proxies HTTP to KluCaller upstream
- Supports WebSocket upgrade (`Upgrade` / `Connection`)
- Uses long timeouts for voice WebSocket (3600s)
- Does **not** alter existing KluKnow/KluCare routes (additive `server_name` only)
- Does **not** bind another port (uses existing 80/443 nginx)
- Uses existing cert pattern (`/opt/klucare/certs` → `/etc/letsencrypt`)

**Phase 3 prerequisite — nginx upstream reachability:**  
`kluknow-production-nginx-1` runs **inside Docker**. It cannot reach host `127.0.0.1:8090`. After explicit approval, set in `.env`:

```env
KLUCALLER_BIND_HOST=0.0.0.0
```

Then recreate **only** `klucaller-v2-app-1` (not klucare/kluknow). Nginx upstream uses `172.17.0.1:8090` (see `scripts/vps_add_klucaller_nginx.sh`).

Steps:

```bash
./scripts/issue_cert_klucaller.sh
APPROVE_NGINX=1 ./scripts/vps_add_klucaller_nginx.sh   # backs up nginx.conf first
```

---

### Phase 4 — Public QA + GPU milestone

```bash
./scripts/qa_smoke.sh https://klucaller.creamylane.com
```

**Milestone that matters:** `klucaller.creamylane.com` reachable → RunPod GPU attached → you talk to KluCaller.

Attach GPU via `.env` URLs only (no GPU on Hostinger):

```env
STT_SERVICE_URL=http://RUNPOD_IP:9000
TTS_SERVICE_URL=http://RUNPOD_IP:9001
OLLAMA_BASE_URL=http://RUNPOD_IP:11434
KLUCALLER_STT=whisper
KLUCALLER_TTS=kokoro-http
KLUCALLER_LLM=ollama
```

---

## Application inventory

| Item | Value |
|------|-------|
| Repo path | `ai-sales-agent/klucaller-v2/` → VPS e.g. `/opt/klucaller-v2` |
| Compose | `deployment/docker-compose.yml` + `deployment/docker-compose.hostinger.yml` |
| Project name | `klucaller-v2` |
| Phase 1 bind | `127.0.0.1:8090` |
| Health | `/health/live`, `/health/ready` |
| Voice UI | `/voice` |
| WebSockets | `/v1/voice/ws` |
| LiveKit | Internal only in Phase 1 |
| DB | None required (in-memory) |
| Volumes | `klucaller-v2_tenant_data`, `klucaller-v2_demo_outputs` |

Secrets: VPS `.env` only — see `deployment/env.hostinger.example`.

---

## Verified locally (not on VPS)

| Check | Result |
|-------|--------|
| pytest | 62 passed |
| Docker CPU stack | healthy |
| `qa_smoke.ps1` | 9/9 PASS |
| Compose merge | OK |

**Unverified:** VPS Phase 1, public HTTPS, human mic, OSS TTFA, barge-in, RunPod path.

---

## Unresolved

1. SSH username for `srv1822157.hstgr.cloud`
2. Phase 0 inspection report
3. Phase 1 PASS on VPS
4. Explicit approval before `APPROVE_NGINX=1`

When SSH is available: **Phase 0 only first**, report findings, then Phase 1.
