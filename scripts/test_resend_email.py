"""
Resend Email Test — Sends a test email to verify the API key works end-to-end.
Uses onboarding@resend.dev as the sender (Resend's default test sender).
The recipient must be your Resend account owner email.
"""
import http.client
import json
import os
import sys

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
if not RESEND_API_KEY:
    print("ERROR: set RESEND_API_KEY in the environment (never commit API keys).")
    sys.exit(1)

TO_EMAIL = os.getenv("RESEND_TEST_TO_EMAIL", "sandeep.sakpal1985@gmail.com")
FROM_EMAIL = "VoiceAI <onboarding@resend.dev>"

payload = {
    "from": FROM_EMAIL,
    "to": [TO_EMAIL],
    "subject": "✅ VoiceAI Email System — Test Successful",
    "html": """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #4f46e5;">
        <span style="color: white; font-size: 24px; font-weight: bold;">V</span>
      </div>
    </div>
    <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px;">Email System Working ✅</h1>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      This is a test email from the VoiceAI platform. The Resend email integration has been successfully configured and is working end-to-end.
    </p>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      <strong>Next step:</strong> Verify a custom domain on Resend to send emails from your own domain.
    </p>
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 16px; border-top: 1px solid #e4e4e7; padding-top: 16px;">
      Sent via Resend API · VoiceAI Orchestrator
    </p>
  </div>
</body>
</html>""",
}

conn = http.client.HTTPSConnection("api.resend.com")
conn.request(
    "POST",
    "/emails",
    body=json.dumps(payload),
    headers={
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    },
)

resp = conn.getresponse()
body = resp.read().decode()
print(f"Status: {resp.status} {resp.reason}")
print(f"Response: {body}")

if resp.status == 200:
    data = json.loads(body)
    print(f"\n✅ Email sent successfully! ID: {data.get('id')}")
    sys.exit(0)
else:
    print(f"\n❌ Failed to send email. Check the error above.")
    sys.exit(1)
