# SIP Provider Readiness Checklist

Connect any SIP trunk provider to FreeSWITCH in under 30 minutes.

---

## Architecture

```
Phone Call → SIP Provider → FreeSWITCH → ESL → AI Pipeline
```

The system works with **any SIP trunk provider** that supports RFC 3261. The only provider-specific changes are in `telephony/configs/freeswitch/sip_profiles/external.xml` (gateway credentials).

---

## Prerequisites

Before starting, ensure:

- [ ] FreeSWITCH is running (Docker or native)
- [ ] Backend is running with `FREESWITCH_BRIDGE_ENABLED=true`
- [ ] ESL bridge is connected: `curl localhost:8000/health/freeswitch`
- [ ] External SIP profile is loaded: `fs_cli -x "sofia status"`
- [ ] Port 5080 (UDP) is reachable from the internet (or use a tunnel)

---

## Provider Comparison

| Feature | Plivo | Exotel | CloudConnect |
|---------|-------|--------|--------------|
| **Model** | Pay-as-you-go (Zentrunk) | Enterprise custom | Channel-based packages |
| **Est. Cost/1K mins** | ₹600 (~$7) | ₹500-1,000 (~$6-12) | ₹400-800 (~$5-10) |
| **Concurrent Calls** | Unlimited (elastic) | 200 CPM default (scalable) | 10 to thousands |
| **Setup Time** | Instant (self-serve) | 1-3 days (sales call) | 1-5 days (sales call) |
| **Sales Call Required** | ❌ No | ✅ Yes | ✅ Yes |
| **API Quality** | Excellent | Good | Moderate |
| **India Coverage** | Excellent | Excellent | Excellent (multi-carrier) |
| **Global Coverage** | Yes | Limited | Yes |
| **Documentation** | Excellent | Good | Fair |
| **FreeSWITCH Compatible** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Recommended For** | Fastest start | Indian ecosystem | Enterprise volume |

---

## Provider Configuration

### Plivo (Recommended for Fastest Start)

**Required Credentials:**
- [ ] Plivo Account SID (from Plivo Console → Account → Settings)
- [ ] Plivo Auth Token (from Plivo Console → Account → Settings)
- [ ] Plivo Phone Number (buy from Plivo Console → Phone Numbers)

**Gateway Configuration (`external.xml`):**
```xml
<gateway name="plivo">
  <param name="username" value="YOUR_PLIVO_AUTH_ID"/>
  <param name="password" value="YOUR_PLIVO_AUTH_TOKEN"/>
  <param name="realm" value="sip.plivo.com"/>
  <param name="register" value="true"/>
  <param name="register-transport" value="udp"/>
  <param name="caller-id-in-from" value="true"/>
  <param name="extension" value="YOUR_PLIVO_NUMBER"/>
  <param name="proxy" value="sip.plivo.com"/>
</gateway>
```

**Plivo Console Steps:**
1. Sign up at https://console.plivo.com (instant, no sales call)
2. Buy a phone number (₹50-200/month depending on type)
3. Create a SIP trunk: **Voice → SIP Trunk → Create SIP Trunk**
4. Set termination URI: `sip:YOUR_FS_PUBLIC_IP:5080`
5. Link your phone number to the SIP trunk

**Required Codecs:** PCMU (G.711 μ-law) or PCMA (G.711 A-law)

**Estimated Monthly Cost:**
- Phone number: ~₹100-200/month
- Per minute: ~₹0.60/min (₹600/1K mins)
- First 1,000 mins: ~₹700-800 total

---

### Exotel

**Required Credentials:**
- [ ] Exotel API Key (from Exotel Dashboard → Settings)
- [ ] Exotel API Token (from Exotel Dashboard → Settings)
- [ ] Exotel Subdomain (e.g., `yourcompany.exotel.com`)
- [ ] Exotel Phone Number (buy from Exotel)

**Gateway Configuration (`external.xml`):**
```xml
<gateway name="exotel">
  <param name="username" value="YOUR_EXOTEL_SIP_USERNAME"/>
  <param name="password" value="YOUR_EXOTEL_SIP_PASSWORD"/>
  <param name="realm" value="sip.exotel.com"/>
  <param name="register" value="true"/>
  <param name="register-transport" value="udp"/>
  <param name="extension" value="YOUR_EXOTEL_NUMBER"/>
  <param name="proxy" value="sip.exotel.com"/>
</gateway>
```

**Exotel Console Steps:**
1. Contact Exotel sales at https://exotel.com/contact (sales call required)
2. Request "vSIP" (Virtual SIP Trunk) product
3. Sign agreement and receive SIP credentials
4. Configure termination IP to your FreeSWITCH public IP
5. Allocate phone numbers to the trunk

**Required Codecs:** G.711 (PCMU/PCMA), G.729

**Estimated Monthly Cost:**
- Setup fee: ₹0-5,000 (negotiable)
- Per minute: ₹0.50-1.00/min (volume-dependent)
- Monthly minimum: Often ₹5,000-10,000

---

### CloudConnect

**Required Credentials:**
- [ ] CloudConnect Account ID
- [ ] SIP Username
- [ ] SIP Password
- [ ] SIP Domain/Realm
- [ ] Phone Number(s) allocated to trunk

**Gateway Configuration (`external.xml`):**
```xml
<gateway name="cloudconnect">
  <param name="username" value="YOUR_CC_SIP_USERNAME"/>
  <param name="password" value="YOUR_CC_SIP_PASSWORD"/>
  <param name="realm" value="sip.cloudconnect.in"/>
  <param name="register" value="true"/>
  <param name="register-transport" value="udp"/>
  <param name="extension" value="YOUR_CC_NUMBER"/>
  <param name="proxy" value="sip.cloudconnect.in"/>
</gateway>
```

**CloudConnect Console Steps:**
1. Contact CloudConnect at https://cloudconnect.in (sales call required)
2. Discuss channel packages (10, 50, 100, 500 concurrent channels)
3. Sign agreement and receive SIP credentials
4. Configure termination IP
5. Allocate phone numbers

**Required Codecs:** G.711, G.729, G.722

**Estimated Monthly Cost:**
- Channel package: ₹3,000-50,000/month depending on channels
- Per-minute overage: ₹0.40-0.80/min
- Best for high-volume (10,000+ mins/month)

---

## Universal Checklist (All Providers)

### Sign-Up Phase
- [ ] Create account with chosen provider
- [ ] Purchase at least one phone number
- [ ] Obtain SIP gateway credentials (username, password, realm)
- [ ] Note the provider's SIP proxy/registration domain

### FreeSWITCH Configuration
- [ ] Copy `external.xml` template from `telephony/configs/freeswitch/sip_profiles/`
- [ ] Fill in gateway credentials (username, password, realm, extension)
- [ ] Set `ext-rtp-ip` and `ext-sip-ip` in `vars.xml` to your public IP
- [ ] Reload external profile: `fs_cli -x "sofia profile external restart reloadxml"`

### Provider Termination Configuration
- [ ] Set termination URI to: `sip:YOUR_PUBLIC_IP:5080`
- [ ] If no static IP, configure tunnel (ngrok/bore) and use that address
- [ ] Add your public IP to the provider's allowlist (if required)

### Testing
- [ ] Check SIP registration: `fs_cli -x "sofia status gateway PROVIDER_NAME"`
- [ ] Expected: `PROVIDER_NAME              REGED`
- [ ] Make test call from your phone to the provider number
- [ ] Watch backend logs for `STAGE[CALL RECEIVED]`
- [ ] Verify audio flows both directions
- [ ] End call and verify `STAGE[CALL ENDED]`

### Security
- [ ] Change ESL password from default (`ClueCon`)
- [ ] Restrict ESL to `127.0.0.1` only
- [ ] Configure firewall: allow UDP 5080 (SIP) and 16384-32768 (RTP) from provider IP range only
- [ ] Enable TLS for SIP trunks in production
- [ ] Set up rate limiting in FreeSWITCH ACLs

---

## Expected Timelines

| Provider | Sign-Up | Configuration | Testing | Total |
|----------|---------|---------------|---------|-------|
| Plivo | 5 min (instant) | 10 min | 10 min | **25 min** |
| Exotel | 1-3 days (sales) | 10 min | 10 min | **1-3 days** |
| CloudConnect | 1-5 days (sales) | 10 min | 10 min | **1-5 days** |

---

## Troubleshooting

### Registration Fails (REGFAIL)
```
fs_cli -x "sofia status gateway plivo"
# Shows REGFAIL
```

**Checklist:**
- [ ] Username and password correct? (double-check from provider console)
- [ ] Realm matches provider's SIP domain?
- [ ] External profile loaded? `fs_cli -x "sofia status"`
- [ ] Firewall allows UDP 5080 outbound?
- [ ] Provider requires IP allowlisting?

### No Audio in Call
- [ ] RTP ports (16384-32768 UDP) open in both directions?
- [ ] NAT traversal configured? (ext-rtp-ip, ext-sip-ip)
- [ ] Codec mismatch? Try PCMU only first
- [ ] Check `fs_cli -x "show codecs"` for available codecs

### Calls Not Reaching FreeSWITCH
- [ ] Is FreeSWITCH running? `fs_cli -x "status"`
- [ ] Is external profile running? `fs_cli -x "sofia status profile external"`
- [ ] Provider termination URI correct? Should be `sip:YOUR_IP:5080`
- [ ] Port forwarding configured on router (if behind NAT)?
- [ ] Using a tunnel? Check that tunnel is active and address is correct

---

## Quick Start (Plivo — Under 30 Minutes)

```bash
# 1. Sign up at https://console.plivo.com (5 min)
# 2. Buy a phone number (5 min)
# 3. Create SIP Trunk in Plivo Console (5 min)

# 4. Configure gateway (2 min)
# Edit telephony/configs/freeswitch/sip_profiles/external.xml
# Fill in: username, password, realm=sip.plivo.com, proxy=sip.plivo.com

# 5. Restart external SIP profile (1 min)
fs_cli -x "sofia profile external restart reloadxml"

# 6. Check registration (1 sec)
fs_cli -x "sofia status gateway plivo"

# 7. Verify backend connection (1 sec)
curl http://localhost:8000/health/freeswitch

# 8. Make first test call — dial your Plivo number from your phone
```
