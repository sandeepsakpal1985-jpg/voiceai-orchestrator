<?php
require __DIR__.'/session.php';
if (!is_file(__DIR__.'/config.php')) { header('Location: setup.php'); exit; }
if (!empty($_SESSION['employee_id'])) { header('Location: index.php'); exit; }
$error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    try {
        if (!hash_equals($_SESSION['crm_csrf'],(string)($_POST['csrf']??''))) throw new RuntimeException('Reload the page and try again.');
        mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
        $c=require __DIR__.'/config.php'; $conn=new mysqli($c['host'],$c['username'],$c['password'],$c['database'], (int)($c['port'] ?? 3306)); $conn->set_charset('utf8mb4');
        $email=strtolower(trim((string)($_POST['email']??'')));
        $key=hash('sha256',$email.'|'.($_SERVER['REMOTE_ADDR']??''));
        $stmt=$conn->prepare('SELECT COUNT(*) n FROM sales_crm_login_attempts WHERE attempt_key=? AND created_at>UTC_TIMESTAMP()-INTERVAL 15 MINUTE'); $stmt->bind_param('s',$key);$stmt->execute();
        if ((int)$stmt->get_result()->fetch_assoc()['n']>=5) throw new RuntimeException('Too many login attempts. Please try again after 15 minutes.');
        $stmt=$conn->prepare('INSERT INTO sales_crm_login_attempts (attempt_key,created_at) VALUES (?,UTC_TIMESTAMP())');$stmt->bind_param('s',$key);$stmt->execute();
        $stmt=$conn->prepare('SELECT * FROM sales_crm_users WHERE email=? AND active=1');$stmt->bind_param('s',$email);$stmt->execute();$user=$stmt->get_result()->fetch_assoc();
        if (!$user || !password_verify((string)($_POST['password']??''),$user['password_hash'])) throw new RuntimeException('Email or password is incorrect.');
        $stmt=$conn->prepare('DELETE FROM sales_crm_login_attempts WHERE attempt_key=?');$stmt->bind_param('s',$key);$stmt->execute();
        $conn->query('DELETE FROM sales_crm_login_attempts WHERE created_at<UTC_TIMESTAMP()-INTERVAL 1 DAY');
        session_regenerate_id(true);$_SESSION['crm_auth_key']=hash('sha256',$user['password_hash']);$_SESSION['employee_id']=$user['employee_id'];$_SESSION['name']=$user['name'];$_SESSION['role']=$user['role'];$_SESSION['crm_csrf']=bin2hex(random_bytes(32));
        if (!empty($user['must_change_password'])) { header('Location: change-password.php'); exit; }
        header('Location: '.($user['role']==='admin'?'index.php':'work.php')); exit;
    } catch(Throwable $ex) { $error=$ex instanceof mysqli_sql_exception?'CRM is temporarily unavailable. Contact your administrator.':$ex->getMessage(); }
}
function safe($v){return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login | Talkvia CRM</title><link rel="stylesheet" href="style.css"></head><body><header><span class="brand">Talkvia <span>Sales CRM</span></span></header><main style="max-width:520px;padding-top:65px"><p class="eyebrow">HOSPITAL SOFTWARE SALES</p><h1>Welcome back.</h1><p>Sign in to manage hospitals and follow-ups.</p><?php if($error): ?><div class="alert error"><?=safe($error)?></div><?php endif ?><section class="panel"><form method="post"><input type="hidden" name="csrf" value="<?=safe($_SESSION['crm_csrf'])?>"><label>Email address<input type="email" name="email" autocomplete="username" maxlength="254" required value="<?=safe($_POST['email']??'')?>"></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button style="width:100%">Sign in</button></form><p class="muted">Need access or a password reset? Contact your CRM administrator.</p></section></main></body></html>
