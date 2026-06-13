# SIP Trunk Provider — Email Templates for Quote Requests

Copy, paste, and adapt these emails when contacting each provider.

---

## 1. Plivo (Zentrunk) — Pay-as-you-go, fastest to start

**Best for:** Getting started immediately. No sales call needed — sign up at console.plivo.com directly.
**Use this if:** You want to bypass the quote process and start with published pricing.

**Self-serve link:** https://console.plivo.com/accounts/signup/

*No email needed — just sign up, create a SIP endpoint, and plug credentials into `external.xml`.*

---

## 2. Exotel (vSIP) — Enterprise, developer ecosystem

**To:** sales@exotel.com (or use their contact form: https://exotel.com/contact-us)
**Subject:** Quote Request — Virtual SIP Trunk for AI Voice Agent (Concurrent Calls)

> Hello Exotel Team,
>
> We are building an AI-powered voice agent for outbound and inbound sales calls, and we'd like to evaluate Exotel as our vSIP trunk provider.
>
> **Our requirements:**
> - **Expected monthly volume:** ~10,000–50,000 minutes initially (scaling to 100K+)
> - **Peak concurrent calls:** ~20–50 simultaneous sessions, scaling to 100+
> - **Traffic type:** Primarily outbound (80%) + inbound (20%)
> - **DIDs needed:** Local Indian numbers (toll-free optional for later)
> - **Security:** TLS/SRTP required
>
> **Please provide:**
> 1. Per-minute pricing for local outbound/inbound calls (volume-based tiers)
> 2. Concurrent call capacity — can we exceed the default 200 CPM limit?
> 3. Minimum commitment / contract terms
> 4. SIP gateway details (realm, proxy, auth type)
> 5. DID provisioning time and process
> 6. SLA for uptime and failover redundancy
> 7. Sandbox/POC environment availability for latency testing
>
> **For context:** Our infrastructure runs on FreeSWITCH, and we will register a SIP gateway for the trunk. We have a test environment ready and would like to complete a POC within 2 weeks.
>
> Looking forward to your proposal.
>
> Best regards,
> [Your Name]
> [Your Company]
> [Your Phone]

---

## 3. CloudConnect — Enterprise, multi-carrier redundancy

**To:** info@cloud-connect.in
**CC:** (add sales contact if provided)
**Subject:** Quote Request — Enterprise SIP Trunking for AI Voice Agent Platform

> Hello CloudConnect Team,
>
> We are evaluating CloudConnect as our SIP trunk provider for an AI-powered voice agent platform. We were impressed by your multi-carrier redundancy and enterprise focus.
>
> **Our requirements:**
> - **Expected monthly volume:** ~10,000–50,000 minutes initially (scaling to 100K+)
> - **Peak concurrent calls:** ~20–50 channels, scaling to 100+
> - **Traffic type:** Primarily outbound (80%) + inbound (20%)
> - **DIDs needed:** Local Indian numbers + toll-free (future)
> - **Security:** SBC, TLS/SRTP required
> - **Deployment:** Cloud-based SIP trunk (we run our own FreeSWITCH)
>
> **Please provide:**
> 1. Per-minute or per-channel pricing for our volume tier
> 2. Recommended channel package (10, 25, 50 channels?)
> 3. Multi-carrier failover — which carriers are in the redundancy pool?
> 4. SIP gateway details (realm, proxy, auth credentials format)
> 5. DID provisioning time and KYC requirements
> 6. SLA for uptime (99.9%+?) and failover RTO
> 7. POC/sandbox availability for latency and call quality testing
>
> **Technical context:** We integrate via FreeSWITCH with an ESL bridge to our AI pipeline (Whisper STT → Qwen LLM → Kokoro TTS). We need standard SIP trunking with register-based authentication.
>
> Looking forward to discussing this further. Happy to hop on a call at your earliest convenience.
>
> Best regards,
> [Your Name]
> [Your Company]
> [Your Phone]
> [Your Email]

---

## Quick Reference — What to ask all providers

| Question | Why It Matters |
|----------|---------------|
| Per-minute rate at our volume? | Costs vary significantly by commitment level |
| How to increase concurrent call limit? | AI agent needs burst capacity during peak dialing |
| Multi-carrier failover? | Redundancy ensures no dropped calls during carrier outages |
| TLS/SRTP available? | Required for secure voice communication |
| DID provisioning time? | Typically 24-48h in India due to KYC |
| POC sandbox available? | Essential for testing latency before committing |

---

## Next steps once you have credentials

```xml
<!-- In external.xml, uncomment the relevant gateway and fill values -->
<gateway name="plivo">
    <param name="username" value="FROM_PROVIDER"/>
    <param name="password" value="FROM_PROVIDER"/>
    <param name="realm" value="zen.sip.plivo.com"/>
    <param name="register" value="true"/>
    <param name="proxy" value="zen.sip.plivo.com"/>
</gateway>
```

Then restart FreeSWITCH and run the E2E smoke test:
```powershell
cd backend
python ../telephony/scripts/e2e_call_test.py -v
```
