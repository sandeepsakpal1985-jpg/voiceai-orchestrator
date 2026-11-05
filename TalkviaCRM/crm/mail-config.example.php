<?php
/**
 * Copy to mail-config.php after purchasing Google Workspace.
 * Prefer saving via Admin → Email settings (writes mail-config.php safely).
 *
 * Google Workspace / Gmail SMTP:
 *   host: smtp.gmail.com
 *   port: 587 + tls   (or 465 + ssl)
 *   username: full mailbox email
 *   password: App password (with 2-Step Verification)
 *   from_email / reply_to: the shared sales mailbox
 */
return [
    'host' => getenv('CRM_SMTP_HOST') ?: 'smtp.gmail.com',
    'port' => (int)(getenv('CRM_SMTP_PORT') ?: 587),
    'username' => getenv('CRM_SMTP_USERNAME') ?: 'sales@yourdomain.com',
    'password' => getenv('CRM_SMTP_PASSWORD') ?: '',
    'from_email' => getenv('CRM_FROM_EMAIL') ?: 'sales@yourdomain.com',
    'from_name' => getenv('CRM_FROM_NAME') ?: 'KluCare Sales',
    'reply_to' => getenv('CRM_REPLY_TO') ?: 'sales@yourdomain.com',
    'encryption' => getenv('CRM_SMTP_ENCRYPTION') ?: 'tls',
];
