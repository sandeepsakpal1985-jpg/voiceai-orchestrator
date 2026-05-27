# Twilio SIP + VoiceAI Integration Guide

> Connect your Twilio phone numbers to the VoiceAI voice pipeline via LiveKit SIP.
> LiveKit acts as the SIP server — no separate SIP proxy needed.

---

## Architecture

```
Caller (PSTN)
    │
    ▼
Twilio Phone Number → Elastic SIP Trunk
    │
    ▼  Origination URI (sip:your-server-ip:5060)
LiveKit SIP Server (livekit-server port 5060)
    │
    ▼  Dispatch Rule → sip-<to-number>
LiveKit Room + VoiceAgent (STT → LLM → TTS)
    │
    ▼  Response Audio
Caller hears AI voice
```

**Two integration paths available:**

| Path | When to Use | Components |
|------|------------|------------|
| **Twilio Webhooks** (HTTP) | No SIP trunk needed, simpler setup | `app/routers/twilio_webhooks.py` — TwiML-based |
| **LiveKit SIP** (Native) | Production, lower latency, full LiveKit features | `app/livekit/sip_dispatch.py` + LiveKit SIP |

This guide covers **both** paths. Start with Webhooks for testing, then move to SIP for production.

---

## Option A: Twilio Webhooks (Quick Start)

### 1. Configure Twilio Phone Number

1. Log in to [Twilio Console](https://console.twilio.com)
2. Go to **Phone Numbers** → **Manage** → **Active Numbers**
3. Select your voice-enabled phone number
4. Under **Voice Configuration**:
   - **When a call comes in**: `Webhook`
   - **URL**: `https://your-domain.com/twilio/incoming`
   - **HTTP method**: `POST`

### 2. Configure Your Server

In your `.env`:
```env
# Twilio webhooks don't need SIP enabled
SIP_ENABLED=false
```

Make sure your server is accessible from Twilio (public IP with port 443 open, or use a tunnel like ngrok for testing).

### 3. Test a Call

```
Dial your Twilio number → hear AI greeting → speak a response → AI replies → say "goodbye" → call ends
```

### 4. Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /twilio/incoming` | Inbound call — returns TwiML greeting + `<Gather>` |
| `POST /twilio/gather` | Speach input from caller — processes through pipeline |
| `POST /twilio/voice` | Fallback when `<Gather>` times out |
| `POST /twilio/status` | Call status callbacks (completed, failed, etc.) |
| `POST /twilio/outbound` | Generates TwiML for outbound calls |

---

## Option B: LiveKit SIP (Production)

### Prerequisites

- LiveKit server v1.11.0+ running (already in `docker-compose.yml`)
- Twilio account with SIP Trunking enabled
- A public IP or domain for the SIP Origination URI
- SIP port 5060 (UDP/TCP) open on your firewall

### Step 1: Create a Twilio Elastic SIP Trunk

1. Go to **Twilio Console** → **SIP Trunking** → **Elastic SIP Trunks**
2. Click **Create new SIP Trunk**
3. Set a friendly name: `VoiceAI SIP Trunk`
4. Under **Termination** → **Origination URIs** → **Add New**:
   - **SIP URI**: `sip:<YOUR_SERVER_PUBLIC_IP>:5060;transport=udp`
   - **Priority**: `1`
   - **Weight**: `1`
   - **Enabled**: ✅

5. Under **Authentication** (optional but recommended):
   - **IP Access Control**: Add your server's public IP
   - Or set **SIP Credential Lists** for username/password auth

6. Click **Save**

### Step 2: Connect Your Phone Number to the SIP Trunk

1. In the SIP Trunk settings, go to **Origination** tab
2. Under **Linked Phone Numbers**, click **+**
3. Select your Twilio phone number

Now all calls to that number will route through the SIP trunk to your LiveKit server.

### Step 3: Configure LiveKit SIP

Edit `livekit.yaml`:
```yaml
# SIP Configuration
sip:
  enabled: true
  server_address: "0.0.0.0"
  port: 5060
  dispatch_rules:
    - destination: "twilio-sip-trunk"
      rule: "match all"
      room: "sip-{{.To}}"
      participant_identity: "caller-{{.From}}"
```

In your `.env`:
```env
SIP_ENABLED=true
SIP_SERVER_ADDRESS=0.0.0.0
SIP_PORT=5060
SIP_ROOM_PREFIX=sip-
SIP_TRUNK_HOST=  # Leave empty for any trunk, or set to your Twilio trunk host
```

### Step 4: Open Firewall Ports

```bash
# UFW rules for SIP
sudo ufw allow 5060/udp  # SIP UDP (primary)
sudo ufw allow 5060/tcp  # SIP TCP (fallback)
sudo ufw allow 7882/udp  # WebRTC ICE for audio
```

**For cloud VPS (Hetzner/OVH):** Also add these ports in the cloud firewall panel.

### Step 5: Restart Services

```bash
docker compose restart livekit-server
docker compose up -d voiceai-api voiceai-worker
```

### Step 6: Verify the SIP Setup

```bash
# Check SIP config endpoint
curl -s http://localhost:8000/sip/config | python -m json.tool

# Expected output:
# {
#   "sip_enabled": true,
#   "server_address": "0.0.0.0",
#   "sip_port": 5060,
#   "room_prefix": "sip-",
#   "dispatch_destination": "twilio-sip-trunk",
#   "note": "Configure your Twilio Elastic SIP Trunk with the Origination URI: sip:0.0.0.0:5060;transport=udp"
# }
```

### Step 7: Test a Call

1. Dial your Twilio phone number from any phone
2. The call should route through Twilio → SIP Trunk → LiveKit → VoiceAI
3. You should hear the AI greeting and be able to have a conversation

### Step 8: Monitor Active Calls

```bash
# List active SIP calls
curl -s http://localhost:8000/sip/calls | python -m json.tool

# Get specific call info
curl -s http://localhost:8000/sip/calls/<call-id> | python -m json.tool

# End a call
curl -s -X POST http://localhost:8000/sip/calls/<call-id>/end | python -m json.tool
```

---

## SIP Call Lifecycle

```
1. Caller dials Twilio number
2. Twilio routes to Elastic SIP Trunk
3. SIP Trunk sends INVITE to LiveKit (port 5060)
4. LiveKit SIP dispatch creates room "sip-<to-number>"
5. VoiceAgent worker joins the room
6. Audio flows bidirectionally over RTP (via WebRTC)
7. VoiceAgent runs STT → LLM → TTS pipeline
8. Caller ends call (or agent detects goodbye)
9. LiveKit room cleaned up after empty_timeout
```

---

## Configuration Reference

### `docker-compose.yml` — SIP Ports (already configured)

```yaml
livekit-server:
  ports:
    - "5060:5060/udp"   # SIP (UDP)
    - "5060:5060/tcp"   # SIP (TCP fallback)
    - "7882:7882/udp"    # WebRTC ICE/UDP
```

### `.env` — SIP Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SIP_ENABLED` | `true` | Enable SIP integration |
| `SIP_SERVER_ADDRESS` | `0.0.0.0` | Bind address for SIP server |
| `SIP_PORT` | `5060` | SIP listening port |
| `SIP_ROOM_PREFIX` | `sip-` | Prefix for SIP call rooms |
| `SIP_DISPATCH_DESTINATION` | `twilio-sip-trunk` | Dispatch rule name |
| `SIP_TRUNK_HOST` | (empty) | Optional: filter by trunk host |

### `livekit.yaml` — SIP Section

```yaml
sip:
  enabled: true
  server_address: "0.0.0.0"
  port: 5060
  dispatch_rules:
    - destination: "twilio-sip-trunk"
      rule: "match all"
      room: "sip-{{.To}}"
      participant_identity: "caller-{{.From}}"
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| **"No route found" when calling** | Firewall blocking port 5060 UDP | `sudo ufw allow 5060/udp` |
| **One-way audio (can't hear AI)** | WebRTC ports blocked | Open ports 7882/UDP, set `public_ip` in `livekit.yaml` |
| **SIP trunk registration fails** | Wrong Origination URI | Verify `<your-server-ip>:5060` is correct and reachable |
| **Calls connect but immediately drop** | Dispatch rule not matching | Check `livekit.yaml` dispatch rules |
| **"403 Forbidden" in LiveKit logs** | API key mismatch | Verify `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` in `.env` |
| **Echo on the call** | No echo cancellation | Enable `voice_agent.echo_cancellation` in livekit.yaml |
| **SIP calls fail after server restart** | LiveKit service order | Ensure `livekit-server` starts before `voiceai-worker` |

### Debugging Commands

```bash
# Watch LiveKit logs for SIP events
docker compose logs -f livekit-server | grep -i sip

# Watch voice worker logs for session events
docker compose logs -f voiceai-worker

# Test SIP port reachability (from external host)
nc -zv <your-server-ip> 5060

# Verify SIP config endpoint
curl -s http://localhost:8000/sip/config | python -m json.tool

# Check active calls
curl -s http://localhost:8000/sip/calls | python -m json.tool
```

---

## Security Considerations

1. **Firewall**: Restrict port 5060 to Twilio's IP ranges only:
   ```bash
   # Get Twilio's SIP media IP ranges
   # https://www.twilio.com/docs/voice/voice-ip-ranges
   sudo ufw allow from <twilio-ip-range> to any port 5060 proto udp
   ```

2. **Authentication**: Use SIP credential lists in Twilio for additional security

3. **Encryption**: For production, configure TLS on the SIP trunk and LiveKit TURN:
   - LiveKit SIP supports TLS when configured with certificates
   - Set `turn.enabled=true` in `livekit.yaml`

4. **Rate Limiting**: Set concurrent call limits in Twilio SIP trunk settings to prevent abuse

---

## Next Steps After Integration

1. **Monitor call quality**: Watch audio latency, packet loss, jitter via LiveKit metrics
2. **Tune the voice**: Adjust `DEFAULT_VOICE_ID`, `TTS_PROVIDER`, and `LLM_TEMPERATURE`
3. **Scale up**: Add more `voiceai-worker` instances for multiple concurrent calls
4. **Add IVR**: Extend the dispatch rules to route calls based on DTMF input
