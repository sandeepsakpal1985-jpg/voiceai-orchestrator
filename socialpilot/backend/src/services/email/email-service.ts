/**
 * MetaPilot AI — Email Service
 *
 * Handles transactional email delivery via Resend:
 * - Email verification
 * - Password reset
 * - Escalation alerts
 *
 * Uses lazy initialization so it doesn't crash when RESEND_API_KEY is unset.
 */

let _resendClient: any = null;

function getResendClient(): any {
  if (_resendClient) return _resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const { Resend } = require('resend');
    _resendClient = new Resend(apiKey);
    return _resendClient;
  } catch {
    console.warn('[EmailService] Resend not available — email delivery disabled');
    return null;
  }
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  fromEmail?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
  dev: boolean;
}

/**
 * Send a transactional email.
 * In development (no API key), logs to console.
 * In production, sends via Resend.
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const { to, subject, html, fromName, fromEmail } = params;
  const FROM_NAME = fromName || 'KluConnect';
  const FROM_EMAIL = fromEmail || 'noreply@kluconnect.com';

  const isDev = process.env.NODE_ENV === 'development' || !process.env.RESEND_API_KEY;

  if (isDev) {
    console.log(`[EmailService] 📧 Would send email to ${to}:`);
    console.log(`[EmailService]    Subject: ${subject}`);
    console.log(`[EmailService]    From: ${FROM_NAME} <${FROM_EMAIL}>`);
    return { success: true, dev: true };
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn(`[EmailService] RESEND_API_KEY not configured — falling back to log`);
    console.log(`[EmailService] 📧 Would send to ${to}: ${subject}`);
    return { success: true, dev: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[EmailService] Resend API error for ${to}:`, error);
      return { success: false, error: error.message, dev: false };
    }

    console.log(`[EmailService] ✅ Sent to ${to}: ${subject} (id: ${data?.id})`);
    return { success: true, id: data?.id, dev: false };
  } catch (err: any) {
    console.error(`[EmailService] Failed to send to ${to}:`, err?.message);
    return { success: false, error: err?.message || 'Email send failed', dev: false };
  }
}

/**
 * Generate a styled HTML email template with KluConnect branding.
 */
export function wrapEmailTemplate(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 20px; color: #2563eb; }
    .footer { text-align: center; padding-top: 24px; font-size: 12px; color: #9ca3af; }
    .btn { display: inline-block; padding: 12px 32px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; }
    .btn:hover { background: #1d4ed8; }
    p { color: #4b5563; font-size: 14px; line-height: 1.6; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>${title}</h1>
      </div>
      ${bodyHtml}
      <div class="footer">
        <p>KluConnect — Turn Every Comment Into A Customer</p>
        <p>If you didn't request this email, you can safely ignore it.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
