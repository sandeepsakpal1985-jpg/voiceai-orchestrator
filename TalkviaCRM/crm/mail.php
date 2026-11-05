<?php
/**
 * Shared SMTP helpers for Talkvia CRM outbound mail.
 * Replies should land in the configured Google Workspace / Gmail mailbox.
 */
function crm_mail_config(): array {
    if (!is_file(__DIR__.'/mail-config.php')) return [];
    $config = require __DIR__.'/mail-config.php';
    return is_array($config) ? $config : [];
}

function crm_mail_ready(?array $config = null): bool {
    $config = $config ?? crm_mail_config();
    foreach (['host', 'username', 'password', 'from_email'] as $key) {
        if (empty($config[$key])) return false;
    }
    return (bool)filter_var($config['from_email'], FILTER_VALIDATE_EMAIL);
}

/**
 * @return PHPMailer\PHPMailer\PHPMailer
 */
function crm_mailer(array $config, string $agentDisplayName = '') {
    require_once __DIR__.'/lib/PHPMailer/Exception.php';
    require_once __DIR__.'/lib/PHPMailer/PHPMailer.php';
    require_once __DIR__.'/lib/PHPMailer/SMTP.php';
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['host'];
    $mail->Port = (int)($config['port'] ?? 587);
    $mail->SMTPAuth = true;
    $mail->Username = $config['username'];
    $mail->Password = $config['password'];
    $mail->SMTPSecure = ($config['encryption'] ?? 'tls') === 'ssl' ? 'ssl' : 'tls';
    $mail->CharSet = 'UTF-8';
    $mail->Timeout = 20;

    $fromEmail = $config['from_email'];
    $brand = trim((string)($config['from_name'] ?? 'KluCare Sales'));
    if ($brand === '') $brand = 'KluCare Sales';
    $fromName = $agentDisplayName !== '' ? ($agentDisplayName.' via '.$brand) : $brand;
    $replyTo = trim((string)($config['reply_to'] ?? ''));
    if ($replyTo === '' || !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $replyTo = $fromEmail;

    $mail->setFrom($fromEmail, $fromName);
    $mail->addReplyTo($replyTo, $brand);
    $mail->Sender = $fromEmail;
    return $mail;
}

/**
 * Parse To: field. Separate addresses with ; (commas/newlines also accepted).
 * @return list<string>
 */
function crm_mail_parse_recipients(string $raw): array {
    $parts = preg_split('/[;,\n]+/', $raw) ?: [];
    $emails = [];
    foreach ($parts as $part) {
        $email = strtolower(trim($part));
        if ($email === '') continue;
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Invalid recipient email: '.$email);
        }
        if (!in_array($email, $emails, true)) $emails[] = $email;
    }
    if (!$emails) throw new RuntimeException('Enter at least one recipient email.');
    if (count($emails) > 10) throw new RuntimeException('You can send to at most 10 recipients at once.');
    return $emails;
}
