<?php
require __DIR__.'/bootstrap.php';
$error = '';
$message = '';
$must = !empty($identity['must_change_password']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!hash_equals($_SESSION['crm_csrf'], (string)($_POST['csrf'] ?? ''))) {
            throw new RuntimeException('Reload the page and try again.');
        }
        $current = (string)($_POST['current_password'] ?? '');
        $next = (string)($_POST['new_password'] ?? '');
        $confirm = (string)($_POST['confirm_password'] ?? '');
        if (!password_verify($current, $identity['password_hash'])) {
            throw new RuntimeException('Current password is incorrect.');
        }
        if (strlen($next) < 12 || strlen($next) > 72) {
            throw new RuntimeException('New password must be 12–72 characters.');
        }
        if ($next !== $confirm) {
            throw new RuntimeException('New password and confirmation do not match.');
        }
        if (password_verify($next, $identity['password_hash'])) {
            throw new RuntimeException('Choose a new password that is different from the temporary one.');
        }
        $hash = password_hash($next, PASSWORD_DEFAULT);
        query('UPDATE sales_crm_users SET password_hash=?, must_change_password=0 WHERE employee_id=?', [$hash, $employee]);
        $_SESSION['crm_auth_key'] = hash('sha256', $hash);
        $_SESSION['crm_message'] = 'Password updated. You can continue in the CRM.';
        header('Location: '.($admin ? 'index.php' : 'work.php'));
        exit;
    } catch (Throwable $ex) {
        $error = $ex instanceof RuntimeException ? $ex->getMessage() : 'Could not update the password. Try again.';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Change password | Talkvia CRM</title>
  <link rel="stylesheet" href="style.css?v=5">
</head>
<body>
<header>
  <span class="brand">Talkvia <span>Sales CRM</span></span>
  <span><?=e($identity['name'])?></span>
</header>
<main style="max-width:560px">
  <p class="eyebrow"><?=$must ? 'FIRST LOGIN' : 'SECURITY'?></p>
  <h1><?=$must ? 'Set a new password' : 'Change password'?></h1>
  <?php if ($must): ?>
    <p>For security, you must replace the temporary password before using the CRM.</p>
  <?php else: ?>
    <p>Choose a new password for your account.</p>
  <?php endif ?>
  <?php if ($error): ?><div class="alert error"><?=e($error)?></div><?php endif ?>
  <section class="panel">
    <form method="post">
      <?=csrf()?>
      <label>Current / temporary password<input type="password" name="current_password" required autocomplete="current-password"></label>
      <label>New password (12–72 characters)<input type="password" name="new_password" required minlength="12" maxlength="72" autocomplete="new-password"></label>
      <label>Confirm new password<input type="password" name="confirm_password" required minlength="12" maxlength="72" autocomplete="new-password"></label>
      <button>Save new password</button>
    </form>
  </section>
  <?php if (!$must): ?>
    <p><a href="index.php">Back to CRM</a></p>
  <?php else: ?>
    <form method="post" action="logout.php"><?=csrf()?><button class="secondary" type="submit">Log out</button></form>
  <?php endif ?>
</main>
</body>
</html>
