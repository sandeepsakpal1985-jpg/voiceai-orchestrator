# MicroSIP Setup Guide

Connect a free softphone to your local FreeSWITCH for testing.

## 1. Download & Install MicroSIP

| Step | Action |
|------|--------|
| 1 | Go to [microsip.org/downloads](https://www.microsip.org/downloads) |
| 2 | Download the **MicroSIP** (not Lite) **installer** for Windows |
| 3 | Run the installer — accept all defaults, no special setup needed |

> **Total time:** ~2 minutes. No account required. Free, open-source (GPL).

## 2. FreeSWITCH Connection Details

Your FreeSWITCH container is already running with the default config. Here's what you need:

| Setting | Value |
|---------|-------|
| **Server/Proxy** | `192.168.65.3` (Docker bridge) |
| **Alternate server** | `103.71.18.205` (host LAN IP) |
| **Port** | `5060` |
| **Transport** | UDP |
| **Username** | `1000` |
| **Password** | `K6bVnaz1qPoJ` |
| **Display Name** | `Test Extension 1000` |

> **Password update:** If you recreate the container, a new password is auto-generated. Retrieve it with:
> ```bash
> docker exec ai-freeswitch sh -c "grep 'default_password' /etc/freeswitch/vars.xml"
> ```

## 3. Configure MicroSIP

1. **Open MicroSIP** — you'll see the main window with a green phone icon
2. Go to **Menu → SIP Account Settings** (or press `F8`)
3. Fill in the fields:

```
Account Name:    FreeSWITCH Local
Server/Proxy:    192.168.65.3
Port:            5060
Transport:       UDP

Username:        1000
Password:        K6bVnaz1qPoJ
Display Name:    Test Extension 1000
Domain/Realm:    192.168.65.3
```

4. Click **OK** — the status should change from red ❌ to green ✅ within a few seconds

## 4. Verify Registration

- ✅ **Green status** in MicroSIP = registered successfully
- ❌ **Red status** = see Troubleshooting below

### On FreeSWITCH side:
```bash
# Check registered users
docker exec ai-freeswitch sh -c "fs_cli -x 'show registrations'"

# Check SIP profile
docker exec ai-freeswitch sh -c "fs_cli -x 'sofia status profile internal'"
```

## 5. Make a Test Call

### Echo test (simplest)
Dial **`9664`** from MicroSIP — you should hear your own voice echoed back.

### Call another extension (2-instance test)
1. Download MicroSIP on a second machine, or run from portable ZIP (no install needed)
2. Configure as user `1001` (same password `K6bVnaz1qPoJ`, same server)
3. From MicroSIP #1, dial `1001` and press Call
4. MicroSIP #2 should ring

### Call FreeSWITCH IVR
Dial **`5000`** — you'll hear the default FreeSWITCH IVR menu.

### Check call logs
```bash
docker exec ai-freeswitch sh -c "fs_cli -x 'show channels'"
docker exec ai-freeswitch sh -c "fs_cli -x 'show calls'"
```

## 6. Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| ❌ Registration failed | Port 5060 not reachable | Check container: `docker ps \| grep ai-freeswitch` |
| ❌ Registration timeouts | Docker bridge IP wrong | Try alternate IP `103.71.18.205` or `127.0.0.1` |
| ❌ Auth failure | Wrong password | Re-run password command: `docker exec ai-freeswitch sh -c "grep 'default_password' /etc/freeswitch/vars.xml"` |
| ❌ Can't hear audio | RTP ports blocked | Docker host networking should expose all UDP ports |
| ❌ Call drops immediately | No dialplan match | Try `9664` (echo test) or `5000` (IVR) |
| ❌ MicroSIP won't register at all | Docker Desktop network mode | See Step 7 below |

## 7. Docker on Windows — Network Notes

Docker Desktop on Windows runs FreeSWITCH inside a Hyper-V VM. `network_mode: host` doesn't expose ports to the host's `127.0.0.1` reliably. Here's the **IP hierarchy to try** (most → least likely to work):

| Priority | IP | When to use |
|----------|-----|-------------|
| 🥇 | `192.168.65.3` | Docker bridge — reliable for VM-to-host |
| 🥈 | `103.71.18.205` | Host LAN IP — works if port is accessible |
| 🥉 | `127.0.0.1` | Loopback — works on some Docker Desktop versions |

**To find the Docker VM IP on your machine:**
```powershell
ipconfig | findstr "192.168"
```

Look for a `vEthernet (DockerNAT)` interface — the IP shown there is what the host can use to reach container ports.

**Last resort:** Restart Docker Desktop and ensure FreeSWITCH is healthy:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep ai-freeswitch
```

## 8. After Testing: Re-enabling AI Pipeline

Once you've verified SIP works with MicroSIP, re-enable the AI pipeline:

1. Add config mounts back to `docker/freeswitch-docker-compose.yml`
2. Restart FreeSWITCH: `cd docker && docker compose -f freeswitch-docker-compose.yml up -d freeswitch --force-recreate`
3. Start the backend: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

> **Current limitation:** The container entrypoint overwrites `/etc/freeswitch/*` from templates on first start. Custom configs need either a full `/etc/freeswitch` directory mount (pre-generated), a custom Dockerfile extending the image, or a post-startup script.
