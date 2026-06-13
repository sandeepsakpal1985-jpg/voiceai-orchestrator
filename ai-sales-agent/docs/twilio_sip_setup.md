# SIP Trunk → FreeSWITCH → AI Agent Setup

Connect any VoIP provider to the AI voice pipeline through FreeSWITCH.

This guide uses **Twilio** as a worked example, but the same flow works with
any SIP trunk provider (Telnyx, Flowroute, AWS Chime, direct carrier, etc.).
The only difference is the gateway credentials in `external.xml`.

---

## Architecture

```
Phone Call → Your Phone Number
                ↓
         VoIP Provider's SIP Trunk
                ↓
         FreeSWITCH (SIP, port 5080)
                ↓
         ESL → Bridge Service
                ↓
         Voice Pipeline (STT → LLM → TTS)
                ↓
         Audio Response → FreeSWITCH → Caller
```

---

## Prerequisites

| Item | Details |
|------|---------|
| Twilio Account | With an active phone number |
| FreeSWITCH | Running with external SIP profile |
| Backend | Running with `FREESWITCH_BRIDGE_ENABLED=true` |
| Public IP | FreeSWITCH must be reachable from Twilio (or use a tunnel) |

---

## Step 1: Configure FreeSWITCH External SIP Profile

Create `telephony/configs/freeswitch/sip_profiles/external.xml`:

```xml
<include>
  <gateway name="twilio">
    <param name="username" value="your-twilio-account-sid"/>
    <param name="password" value="your-twilio-auth-token"/>
    <param name="realm" value="your-twilio-sip-domain.sip.us1.twilio.com"/>
    <param name="register" value="true"/>
    <param name="register-transport" value="udp"/>
    <param name="caller-id-in-from" value="false"/>
    <param name="extension" value="your-twilio-number"/>
    <param name="proxy" value="your-twilio-sip-domain.sip.us1.twilio.com"/>
  </gateway>
</include>
```

## Step 2: Provider Configuration

The exact steps vary by provider, but follow the same pattern:

1. **Create a SIP trunk / connection** in your provider's dashboard
2. **Set the termination URI** to point at FreeSWITCH:
   `sip:YOUR_PUBLIC_IP:5080`
3. **Point your phone number** to the SIP trunk

### Worked Example: Twilio Console

1. Go to **Twilio Console → SIP Trunking → Trunks**
2. Click **Create New SIP Trunk** → Name: `AI Sales Agent FS`
3. **Termination** → **SIP Termination URI:** `sip:your-fs-ip:5080`
4. **SIP Domain** → Create `ai-agent-01.sip.us1.twilio.com`
5. **Phone Numbers → Manage** → Your number → Configure with this SIP trunk

## Step 3: Enable FreeSWITCH External Profile

In `conf/sip_profiles/external.xml`:

```xml
<param name="ext-rtp-ip" value="$${external_rtp_ip}"/>
<param name="ext-sip-ip" value="$${external_sip_ip}"/>
```

In `vars.xml`:

```xml
<X-PRE-PROCESS cmd="set" data="external_sip_ip=your-public-ip"/>
<X-PRE-PROCESS cmd="set" data="external_rtp_ip=your-public-ip"/>
```

## Step 4: Test the Twilio→FreeSWITCH Connection

### 4a. Check Registration
```bash
fs_cli -x "sofia status gateway twilio"
```
Expected: `twilio              REGED` or `REGFAIL` — should show registered.

### 4b. Test Inbound Call
1. Dial your Twilio number from your phone
2. Watch backend logs:
```
STAGE[CALL RECEIVED] Call abc123: Incoming from YOUR_NUMBER -> TWILIO_NUMBER
STAGE[CALL ANSWERED] Call abc123: Answered, starting AI conversation
```

## Step 5: Outbound Calls (Optional)

For outbound calls through Twilio:

### 5a. Add Outbound Route

In Twilio SIP Trunk → **Origination**:
```
URI: sip:your-fs-ip:5080
Priority: 1
Weight: 1
```

### 5b. Configure FreeSWITCH to route through Twilio

```
fs_cli -x "sofia profile external gw + twilio/sip:+1234567890@your-twilio-trunk.sip.us1.twilio.com"
```

Then in dialplan:

```xml
<extension name="outbound_twilio">
  <condition field="destination_number" expression="^\+?1?\d{10}$">
    <action application="bridge" data="sofia/gateway/twilio/${destination_number}"/>
  </condition>
</extension>
```

---

## Troubleshooting

### SIP Registration Fails
```bash
fs_cli -x "sofia status gateway twilio"
# If REGFAIL:
fs_cli -x "sofia profile external gwlist"
fs_cli -x "sofia loglevel all 9"  # Enable debug SIP logging
```
**Check:** Twilio credentials, public IP reachability, firewall (port 5060 UDP).

### Firewall Requirements

| Port | Protocol | Purpose |
|------|----------|---------|
| 5060 | UDP | SIP signaling (internal) |
| 5080 | UDP | SIP signaling (external) |
| 16384-32768 | UDP | RTP media |

### Using a Tunnel (No Public IP)

Use `ngrok` or `bore` to expose FreeSWITCH:

```bash
# Ngrok (TCP tunnel for SIP)
ngrok tcp 5060

# Bore
bore local 5060 --to bore.pub
```

Update Twilio trunk termination URI to the tunnel address.

---

## Verification

```bash
# 1. Check SIP registration
fs_cli -x "sofia status"

# 2. Check bridge connected
curl http://localhost:8000/health/freeswitch

# 3. Run E2E smoke test
python telephony/scripts/e2e_call_test.py

# 4. Check Twilio call logs
# Twilio Console → Monitor → Logs → Calls
```

---

## Configuration Files

All configuration files are in `telephony/configs/freeswitch/`:

| File | Purpose |
|------|---------|
| `sip_profiles/internal.xml` | Internal SIP (LAN) |
| `sip_profiles/external.xml` | External SIP (Twilio) |
| `dialplan/default.xml` | Call routing |
| `ai_bridge.xml` | Bridge connection |

---

## Security

1. **Restrict ESL access:** Bind ESL to `127.0.0.1` only
2. **Change ESL password:** `ClueCon` is the default — change it
3. **Firewall:** Restrict SIP/RTP ports to Twilio IP ranges only
4. **TLS:** Enable TLS for SIP trunks in production
5. **Rate limiting:** FreeSWITCH has built-in ACLs in `conf/acl.conf.xml`
