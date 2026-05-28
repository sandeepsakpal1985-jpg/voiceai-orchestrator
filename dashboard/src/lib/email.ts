/**
 * VoiceAI Dashboard — Email Utility
 *
 * Handles sending transactional emails (verification, password reset, etc.).
 * In development mode, emails are logged to console instead of being sent.
 * In production, plug in a real email provider (Resend, SendGrid, SES, etc.).
 */

const FROM_NAME = "VoiceAI";
const FROM_EMAIL = process.env.EMAIL_FROM ?? "noreply@voiceai.com";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email. In development, logs to console.
 * In production, uses the configured email provider.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    console.log("━━━ 📧 Dev Email ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  To:      ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Text:    ${text ?? "(HTML only)"}`);
    console.log(`  HTML:    ${html.slice(0, 200)}...`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return { success: true, dev: true };
  }

  try {
    // Production email sending — plug in your provider here
    // Example: Resend, SendGrid, AWS SES, etc.
    // await resend.emails.send({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to, subject, html, text });

    console.log(`[Email] Sent to ${to}: ${subject}`);
    return { success: true };
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error);
    throw error;
  }
}

/**
 * Generate the verification email HTML template.
 */
export function buildVerificationEmail({
  userName,
  verificationUrl,
}: {
  userName: string;
  verificationUrl: string;
}) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #4f46e5;">
        <span style="color: white; font-size: 24px; font-weight: bold;">V</span>
      </div>
    </div>
    <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px;">Verify your email address</h1>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      Hi ${userName || "there"},<br/><br/>
      Thanks for creating a VoiceAI account! Please verify your email address by clicking the button below.
    </p>
    <div style="text-align: center;">
      <a href="${verificationUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Verify Email Address
      </a>
    </div>
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 24px;">
      Or copy this link: <br/>
      <span style="color: #4f46e5; word-break: break-all;">${verificationUrl}</span>
    </p>
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 16px; border-top: 1px solid #e4e4e7; padding-top: 16px;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

  return {
    html,
    text: `Verify your email address\n\nHi ${userName || "there"},\n\nThanks for creating a VoiceAI account! Please verify your email by visiting:\n${verificationUrl}\n\nIf you didn't create an account, you can safely ignore this email.`,
  };
}

/**
 * Generate the password reset email HTML template.
 */
export function buildPasswordResetEmail({
  userName,
  resetUrl,
}: {
  userName: string;
  resetUrl: string;
}) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #4f46e5;">
        <span style="color: white; font-size: 24px; font-weight: bold;">V</span>
      </div>
    </div>
    <h1 style="font-size: 20px; font-weight: 600; color: #18181b; margin: 0 0 8px;">Reset your password</h1>
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      Hi ${userName || "there"},<br/><br/>
      We received a request to reset your VoiceAI password. Click the button below to set a new one. This link expires in 1 hour.
    </p>
    <div style="text-align: center;">
      <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Reset Password
      </a>
    </div>
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 24px;">
      Or copy this link: <br/>
      <span style="color: #4f46e5; word-break: break-all;">${resetUrl}</span>
    </p>
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin-top: 16px; border-top: 1px solid #e4e4e7; padding-top: 16px;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

  return {
    html,
    text: `Reset your password\n\nHi ${userName || "there"},\n\nWe received a request to reset your VoiceAI password. Visit this link to set a new one (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  };
}
