# Plivo SIP Trunk Setup Guide

> **Time:** ~10 minutes
> **Cost:** ₹0/min for incoming, ₹0.60/min for outgoing (pay-as-you-go)
> **Requirements:** Valid email address, phone number for verification

## 1. Sign Up

1. Go to **[https://www.plivo.com/signup/](https://www.plivo.com/signup/)**
2. Enter your email, name, and password
3. Verify your email (check inbox for confirmation link)
4. Add a payment method (credit card) — Plivo requires this even for the free trial
5. You'll receive **$10 free trial credit** — enough for ~1,000 minutes of calling

Once logged in, you'll land at the **[Plivo Console](https://console.plivo.com/)**.

---

## 2. Get a Phone Number

1. In the Plivo Console, go to **Phone Numbers → Buy Numbers**
2. Search for a number in your desired country/city
3. Select a number and complete the purchase (costs ~$1-2/month)
4. Note the number — this will be your caller ID for outbound calls

---

## 3. Create SIP Credentials (Zentrunk)

Plivo's SIP trunking service is called **Zentrunk**.

1. In the Plivo Console, go to **Zentrunk** (left sidebar)
2. Click **Credential Lists** → **Create Credential List**
3. Name it something descriptive (e.g., `ai-sales-agent-trunk`)
4. Under **Credentials**, click **Add Credential**
5. Set a **Username** and **Password** (save these — you'll need them for FreeSWITCH)
6. Click **Save**

![Zentrunk Credentials](https://www.plivo.com/docs/assets/img/sip-trunking/credential-list.png)

> **Note:** Plivo also offers "Endpoints" under **Voice → Endpoints** if you prefer individual SIP registrations. For trunking, use Zentrunk Credential Lists.

---

## 4. Configure the SIP Trunk

1. Go to **Zentrunk → Outbound Trunks** → **Create Outbound Trunk**
2. Name it `ai-sales-agent-outbound`
3. **Termination URI:** `sip:user@your-server-ip-or-domain.com:5060`
4. **SIP Credentials:** Select the credential list you created
5. **Codecs:** Enable G.711 (PCMU/PCMA) — FreeSWITCH default
6. Leave other settings at defaults
7. Click **Save**

---

## 5. Configure FreeSWITCH Gateway

Edit `telephony/configs/freeswitch/sip_profiles/external.xml` and add a gateway block:

```xml
<gateway name="plivo">
  <param name="username" value="YOUR_PLIVO_SIP_USERNAME"/>
  <param name="password" value="YOUR_PLIVO_SIP_PASSWORD"/>
  <param name="proxy" value="sip.plivo.com"/>
  <param name="realm" value="sip.plivo.com"/>
  <param name="register" value="true"/>
  <param name="register-transport" value="udp"/>
  <param name="caller-id-in-from" value="true"/>
  <param name="extension" value="YOUR_PLIVO_PHONE_NUMBER"/>
</gateway>
```

Replace:
- `YOUR_PLIVO_SIP_USERNAME` — The username from the Credential List
- `YOUR_PLIVO_SIP_PASSWORD` — The corresponding password
- `YOUR_PLIVO_PHONE_NUMBER` — The phone number you purchased (e.g., `+17373553206`)

---

## 6. Restart FreeSWITCH and Verify

```bash
# Restart FreeSWITCH (Docker)
docker compose -f docker/freeswitch-docker-compose.yml restart freeswitch

# Check SIP registration status
docker exec ai-freeswitch fs_cli -x "sofia status"

# You should see "plivo" as a registered gateway:
# Name                        Type        Data                                   State
#================================================================================================
# plivo                        profile     sip.plivo.com                           REGED
```

---

## 7. Test the Connection

### Outbound Test
```bash
# Make a test call through Plivo
docker exec ai-freeswitch fs_cli -x "originate sofia/gateway/plivo/YOUR_TEST_NUMBER &echo()"
```

### Inbound Test (requires configured dialplan)
1. Dial your Plivo phone number from any phone
2. The call should route to FreeSWITCH via the SIP trunk
3. FreeSWITCH's dialplan should send it to the AI pipeline

---

## 8. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `sofia status` shows `NOREG` | Wrong credentials | Double-check username/password in gateway block |
| Registration timeout | Firewall blocking port 5060 | Open UDP 5060 in your firewall/cloud security group |
| "408 Request Timeout" | Plivo proxy unreachable | Check DNS: `nslookup sip.plivo.com` |
| One-way audio | NAT/RTP issues | Set `ext-rtp-ip` and `ext-sip-ip` in vars.xml |
| Calls not reaching FS | Dialplan not configured | Verify dialplan routes to `ai_bridge.xml` |
| `ext-rtp-ip` is `127.0.0.1` | Wrong for external traffic | Change to your server's public IP or `auto` |

---

## 9. Next Steps

Once the gateway shows `REGED`:
1. Follow `docs/first_live_call.md` to make your first AI-powered call
2. Monitor call quality and latency through `/health/freeswitch`
3. Adjust codecs in `internal.xml` if audio quality is poor

> **Plivo Docs Reference:** https://plivo.com/docs/sip-trunking/interconnection-guides/freeswitch
