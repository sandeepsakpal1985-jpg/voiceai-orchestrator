<?php
require __DIR__.'/session.php';
if (is_file(__DIR__.'/config.php')) { header('Location: login.php'); exit; }
$error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    try {
        if (!hash_equals($_SESSION['crm_csrf'],(string)($_POST['csrf']??''))) throw new RuntimeException('Reload this page before continuing.');
        $host=trim((string)($_POST['host']??'localhost'));
        $database=trim((string)($_POST['database']??''));
        $username=trim((string)($_POST['username']??''));
        $password=(string)($_POST['database_password']??'');
        $name=trim((string)($_POST['name']??''));
        $email=strtolower(trim((string)($_POST['email']??'')));
        $adminPassword=(string)($_POST['admin_password']??'');
        if (!$host || !$database || !$username || strlen($name)>160 || strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Complete all fields with a valid admin email.');
        if ($adminPassword==='' || strlen($adminPassword)>72) throw new RuntimeException('Enter your admin password (maximum 72 characters).');
        mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
        try { $conn=new mysqli($host,$username,$password,$database); $conn->set_charset('utf8mb4'); }
        catch(Throwable $ex) { throw new RuntimeException('Database connection failed. Check the four database details from Hostinger.'); }
        $lock=fopen(__DIR__.'/setup.lock','c');
        if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('Cannot lock installer. Check folder permissions.');
        if (is_file(__DIR__.'/config.php')) { header('Location: login.php'); exit; }
        // Do not reset an existing installation if its local config was removed.
        foreach(explode(';',file_get_contents(__DIR__.'/schema.sql')) as $sql) if(trim($sql)!=='') $conn->query($sql);
        $restoring=(int)$conn->query('SELECT COUNT(*) n FROM sales_crm_users')->fetch_assoc()['n']>0;
        $adminId='ADMIN';
        if ($restoring) {
            // Reconnect only after verifying an existing active admin. Never reset users.
            $key=hash('sha256',$email.'|'.($_SERVER['REMOTE_ADDR']??''));
            $stmt=$conn->prepare('SELECT COUNT(*) n FROM sales_crm_login_attempts WHERE attempt_key=? AND created_at>UTC_TIMESTAMP()-INTERVAL 15 MINUTE');
            $stmt->bind_param('s',$key);$stmt->execute();
            if ((int)$stmt->get_result()->fetch_assoc()['n']>=5) throw new RuntimeException('Too many attempts. Wait 15 minutes before retrying.');
            $stmt=$conn->prepare('INSERT INTO sales_crm_login_attempts (attempt_key,created_at) VALUES (?,UTC_TIMESTAMP())');$stmt->bind_param('s',$key);$stmt->execute();
            $stmt=$conn->prepare("SELECT * FROM sales_crm_users WHERE email=? AND role='admin' AND active=1 LIMIT 1");$stmt->bind_param('s',$email);$stmt->execute();
            $existing=$stmt->get_result()->fetch_assoc();
            if (!$existing || !password_verify($adminPassword,$existing['password_hash'])) throw new RuntimeException('Existing CRM found. Enter the ORIGINAL admin email and password to restore its connection.');
            $adminId=$existing['employee_id'];$name=$existing['name'];$hash=$existing['password_hash'];
            $stmt=$conn->prepare('DELETE FROM sales_crm_login_attempts WHERE attempt_key=?');$stmt->bind_param('s',$key);$stmt->execute();
        } else {
            if ($name==='' || strlen($adminPassword)<12) throw new RuntimeException('For a new CRM, enter your name and a password of at least 12 characters.');
        }
        $config=['host'=>$host,'database'=>$database,'username'=>$username,'password'=>$password];
        $text="<?php\nreturn ".var_export($config,true).";\n";
        $file=fopen(__DIR__.'/config.php','x');
        if (!$file) throw new RuntimeException('Cannot save configuration. Check folder permissions.');
        if (fwrite($file,$text)!==strlen($text)) { fclose($file); unlink(__DIR__.'/config.php'); throw new RuntimeException('Could not save configuration.'); }
        fclose($file); chmod(__DIR__.'/config.php',0600);
        try {
            if (!$restoring) {
            $stmt=$conn->prepare("INSERT INTO sales_crm_users (employee_id,name,email,password_hash,role,created_at) VALUES ('ADMIN',?,?,?,'admin',UTC_TIMESTAMP())");
            $hash=password_hash($adminPassword,PASSWORD_DEFAULT);$stmt->bind_param('sss',$name,$email,$hash);$stmt->execute();
            }
        } catch(Throwable $ex) { unlink(__DIR__.'/config.php'); throw $ex; }
        session_regenerate_id(true); $_SESSION['crm_auth_key']=hash('sha256',$hash);$_SESSION['employee_id']=$adminId;$_SESSION['role']='admin';$_SESSION['name']=$name;
        $_SESSION['crm_csrf']=bin2hex(random_bytes(32));
        $_SESSION['crm_message']=$restoring?'CRM connection restored. Your records and users are unchanged.':'CRM created.';
        header('Location: index.php');exit;
    } catch(Throwable $ex) {
        $error=$ex instanceof mysqli_sql_exception?'Setup could not create CRM tables. Check database permissions.':$ex->getMessage();
    }
}
function safe($v){return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up Talkvia CRM</title><link rel="stylesheet" href="style.css"></head><body><header><span class="brand">Talkvia <span>Sales CRM</span></span></header><main style="max-width:820px"><p class="eyebrow">SET UP / RESTORE CONNECTION</p><h1>Connect your sales workspace.</h1><p>Enter the existing CRM database details and your original admin email/password to restore access. For a new database, create a new admin login below.</p><?php if($error): ?><div class="alert error"><?=safe($error)?></div><?php endif ?><section class="panel"><form method="post"><input type="hidden" name="csrf" value="<?=safe($_SESSION['crm_csrf'])?>"><h2>1. Database details</h2><p class="muted">Restoring access? Use the SAME database name, username and password used before. Do not create a new database.</p><div class="grid"><?php foreach(['host'=>'Database host','database'=>'Database name','username'=>'Database username'] as $key=>$label): ?><label><?=safe($label)?><input name="<?=safe($key)?>" required value="<?=safe($_POST[$key]??($key==='host'?'localhost':''))?>"></label><?php endforeach ?><label>Database password<input type="password" name="database_password" autocomplete="new-password"></label></div><h2>2. Admin login</h2><div class="grid"><label>Your name (new CRM only)<input name="name" maxlength="160" value="<?=safe($_POST['name']??'')?>"></label><label>Login email<input type="email" name="email" maxlength="254" required value="<?=safe($_POST['email']??'')?>"></label><label>Admin password (original password for recovery)<input type="password" name="admin_password" maxlength="72" autocomplete="current-password" required></label></div><button>Connect / restore CRM</button></form></section><p class="muted">Complete setup before sharing this URL with agents. Use HTTPS for this installation.</p></main></body></html>
