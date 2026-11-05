<?php
require __DIR__.'/bootstrap.php';
require_once __DIR__.'/mail.php';
if (!$admin) { http_response_code(403); exit('Admin access required.'); }
$error = '';
$message = '';
$config = crm_mail_config();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!hash_equals($_SESSION['crm_csrf'], (string)($_POST['csrf'] ?? ''))) {
            throw new RuntimeException('Reload this page and try again.');
        }
        $intent = (string)($_POST['intent'] ?? 'save');

        if ($intent === 'save') {
            $host = posttext('host', 255);
            $username = posttext('username', 254);
            $password = posttext('password', 1000);
            $email = posttext('from_email', 254);
            $name = posttext('from_name', 160);
            $replyTo = posttext('reply_to', 254);
            $port = (int)($_POST['port'] ?? 587);
            $enc = posttext('encryption', 10);
            if (!$host || !$username || !filter_var($email, FILTER_VALIDATE_EMAIL) || !in_array($port, [465, 587], true) || !in_array($enc, ['tls', 'ssl'], true)) {
                throw new RuntimeException('Complete the SMTP settings with a valid sender email and port 465 or 587.');
            }
            if (($port === 465 && $enc !== 'ssl') || ($port === 587 && $enc !== 'tls')) {
                throw new RuntimeException('Choose SSL for 465 or STARTTLS for 587.');
            }
            if ($replyTo !== '' && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('Reply-To must be a valid email, or leave it blank to use the sender address.');
            }
            if ($password === '') $password = (string)($config['password'] ?? '');
            if ($password === '') throw new RuntimeException('Enter the mailbox password (Google Workspace app password).');
            $next = [
                'host' => $host,
                'port' => $port,
                'username' => $username,
                'password' => $password,
                'from_email' => $email,
                'from_name' => $name !== '' ? $name : 'KluCare Sales',
                'reply_to' => $replyTo !== '' ? $replyTo : $email,
                'encryption' => $enc,
            ];
            $temp = tempnam(__DIR__, 'mail-');
            if (!$temp) throw new RuntimeException('Could not create settings file. Check folder permissions.');
            chmod($temp, 0600);
            $text = "<?php\nreturn ".var_export($next, true).";\n";
            if (file_put_contents($temp, $text, LOCK_EX) !== strlen($text) || !rename($temp, __DIR__.'/mail-config.php')) {
                @unlink($temp);
                throw new RuntimeException('Could not save settings. Check folder permissions.');
            }
            $_SESSION['crm_message'] = 'Email settings saved. Send a test email below before agents use Compose email.';
            header('Location: mail-settings.php');
            exit;
        }

        if ($intent === 'test') {
            if (!crm_mail_ready($config)) {
                throw new RuntimeException('Save Google Workspace SMTP settings first, then send a test.');
            }
            $to = posttext('test_to', 254);
            if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('Enter a valid test recipient email.');
            }
            $mail = crm_mailer($config, (string)$identity['name']);
            $mail->addAddress($to);
            $mail->Subject = 'KluCare CRM test email';
            $mail->Body = "This is a test from Talkvia CRM.\n\n".
                "If you received this, outbound SMTP is working.\n".
                "Reply to this message — your reply should arrive in the shared business mailbox:\n".
                ($config['reply_to'] ?? $config['from_email'])."\n\n".
                "Sent by ".$identity['name']." at ".gmdate('Y-m-d H:i')." UTC.";
            $mail->isHTML(false);
            $mail->send();
            $_SESSION['crm_message'] = 'Test email accepted by SMTP for '.$to.'. Open that inbox, then reply once to confirm the shared mailbox receives it.';
            header('Location: mail-settings.php');
            exit;
        }

        throw new RuntimeException('Unknown action.');
    } catch (Throwable $ex) {
        $error = $ex->getMessage();
        if (!($ex instanceof RuntimeException)) {
            error_log('CRM mail settings: '.$ex->getMessage());
            $error = 'Could not complete email settings. Check SMTP host, app password, and server outbound port 587.';
        }
    }
}
$message = $_SESSION['crm_message'] ?? '';
unset($_SESSION['crm_message']);
$ready = crm_mail_ready($config);
$fromEmail = (string)($config['from_email'] ?? '');
$replyTo = (string)($config['reply_to'] ?? $fromEmail);
$host = (string)($config['host'] ?? 'smtp.gmail.com');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Email settings | Talkvia CRM</title>
  <link rel="stylesheet" href="style.css?v=5">
</head>
<body>
<header>
  <a href="index.php" class="brand">Talkvia <span>Sales CRM</span></a>
  <nav>
    <a href="reports.php">Calling reports</a>
    <a class="button secondary" href="index.php">Back to CRM</a>
  </nav>
</header>
<main style="max-width:860px">
  <p class="eyebrow">SPRINT B · OUTBOUND MAIL</p>
  <h1>Email settings</h1>
  <p>Send from the CRM using your <strong>Google Workspace / Gmail business mailbox</strong> (Scalaux or KluCare). Client replies go to that same Gmail inbox — not into a CRM mailbox viewer.</p>

  <?php if ($error): ?><div class="alert error"><?=e($error)?></div><?php endif ?>
  <?php if ($message): ?><div class="alert"><?=e($message)?></div><?php endif ?>

  <section class="panel">
    <h2>Status</h2>
    <?php if ($ready): ?>
      <p><span class="badge">Ready</span> Outbound SMTP is configured for <strong><?=e($fromEmail)?></strong>. Reply-To: <strong><?=e($replyTo !== '' ? $replyTo : $fromEmail)?></strong>.</p>
    <?php else: ?>
      <p><span class="badge">Not configured</span> Purchase Google Workspace, create the shared mailbox, then paste SMTP details below.</p>
    <?php endif ?>
  </section>

  <section class="panel">
    <h2>Google Workspace checklist</h2>
    <ol>
      <li>Buy Google Workspace for your Scalaux / KluCare domain.</li>
      <li>Create a shared mailbox such as <code>sales@yourdomain.com</code> (or use a Group that delivers to the team).</li>
      <li>Turn on 2-Step Verification for that user, then create an <strong>App password</strong> for Mail (or use Workspace SMTP relay if your admin prefers).</li>
      <li>Save settings here with host <code>smtp.gmail.com</code>, port <code>587</code>, STARTTLS.</li>
      <li>Send a test email, then reply to it and confirm the reply appears in the business Gmail inbox.</li>
    </ol>
    <p class="muted">Full notes: see <code>EMAIL_SETUP.md</code> in the TalkviaCRM folder. Never commit <code>mail-config.php</code>.</p>
  </section>

  <section class="panel">
    <div class="heading">
      <h2>SMTP connection</h2>
      <button type="button" class="button secondary" id="preset-gmail">Fill Gmail / Workspace defaults</button>
    </div>
    <form method="post">
      <?=csrf()?>
      <input type="hidden" name="intent" value="save">
      <div class="grid">
        <label>SMTP host<input name="host" id="smtp-host" required value="<?=e($host !== '' ? $host : 'smtp.gmail.com')?>" placeholder="smtp.gmail.com"></label>
        <label>SMTP username (full email)<input name="username" id="smtp-user" required value="<?=e($config['username'] ?? '')?>" placeholder="sales@yourdomain.com"></label>
        <label>Sender email (From)<input name="from_email" id="smtp-from" type="email" required value="<?=e($fromEmail)?>" placeholder="sales@yourdomain.com"></label>
        <label>Sender display name<input name="from_name" id="smtp-name" value="<?=e($config['from_name'] ?? 'KluCare Sales')?>" placeholder="KluCare Sales"></label>
        <label>Reply-To (shared inbox)<input name="reply_to" id="smtp-reply" type="email" value="<?=e($replyTo)?>" placeholder="Same as sender if blank later saved as From"></label>
        <label>App password / SMTP password<input type="password" name="password" autocomplete="new-password" placeholder="<?=empty($config['password']) ? 'Google app password' : 'Saved — leave blank to keep'?>"></label>
        <label>Port
          <select name="port" id="smtp-port">
            <option value="587" <?=($config['port'] ?? 587) == 587 ? 'selected' : ''?>>587</option>
            <option value="465" <?=($config['port'] ?? 587) == 465 ? 'selected' : ''?>>465</option>
          </select>
        </label>
        <label>Encryption
          <select name="encryption" id="smtp-enc">
            <option value="tls" <?=($config['encryption'] ?? 'tls') === 'tls' ? 'selected' : ''?>>STARTTLS (587)</option>
            <option value="ssl" <?=($config['encryption'] ?? 'tls') === 'ssl' ? 'selected' : ''?>>SSL (465)</option>
          </select>
        </label>
      </div>
      <button>Save email settings</button>
    </form>
    <p class="muted">From address must be the business mailbox. Agents appear as “Agent name via KluCare Sales”; Reply-To stays the shared inbox so hospital replies land in Gmail.</p>
  </section>

  <section class="panel">
    <h2>Send test email</h2>
    <p>Use an address you control. After it arrives, reply once and check the shared Gmail.</p>
    <form method="post" class="grid" style="grid-template-columns:1fr auto;align-items:end">
      <?=csrf()?>
      <input type="hidden" name="intent" value="test">
      <label>Test recipient<input type="email" name="test_to" required placeholder="you@personal-email.com" <?=!$ready ? 'disabled' : ''?>></label>
      <button <?=$ready ? '' : 'disabled'?>>Send test</button>
    </form>
    <?php if (!$ready): ?><p class="muted">Save SMTP settings before sending a test.</p><?php endif ?>
  </section>
</main>
<script>
document.getElementById('preset-gmail')?.addEventListener('click', () => {
  document.getElementById('smtp-host').value = 'smtp.gmail.com';
  document.getElementById('smtp-port').value = '587';
  document.getElementById('smtp-enc').value = 'tls';
  if (!document.getElementById('smtp-name').value) document.getElementById('smtp-name').value = 'KluCare Sales';
});
</script>
</body>
</html>
