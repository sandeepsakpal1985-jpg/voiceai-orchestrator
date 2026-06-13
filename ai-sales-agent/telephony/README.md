# Telephony Integration

## Overview

The AI Sales Agent supports telephony integration through Twilio for inbound and outbound phone calls.

## Architecture

```
PSTN Caller → Twilio → Twilio Webhooks → AI Sales Agent → STT → LLM → TTS → Audio Response
```

## Twilio Setup

### 1. Configure a Twilio Phone Number
1. Purchase a phone number from Twilio Console
2. Set the Voice webhook URL to: `https://your-domain.com/twilio/incoming`
3. Set the Status callback URL to: `https://your-domain.com/twilio/status`

### 2. Environment Variables
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 3. Webhook Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /twilio/incoming` | Inbound call handler |
| `POST /twilio/gather` | Speech input gathering |
| `POST /twilio/voice` | Fallback when no input detected |
| `POST /twilio/status` | Call status callbacks |
| `POST /twilio/outbound` | Initiate outbound calls |

## SIP Integration (LiveKit)

For production deployments, use LiveKit SIP for better audio quality:
- LiveKit SIP Server handles the WebRTC ↔ SIP bridge
- Twilio Elastic SIP Trunk routes calls to LiveKit
- Agent workers join LiveKit rooms for audio processing
