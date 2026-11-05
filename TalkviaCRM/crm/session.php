<?php
if (session_status() === PHP_SESSION_NONE) {
    session_name('TALKVIA_SALES_CRM');
    session_set_cookie_params(['httponly'=>true,'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','samesite'=>'Lax','path'=>'/']);
    session_start();
}
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
if (isset($_SESSION['employee_id']) && time()-(int)($_SESSION['crm_last_activity']??time())>28800) $_SESSION=[];
$_SESSION['crm_last_activity']=time();
$_SESSION['crm_csrf']=$_SESSION['crm_csrf']??bin2hex(random_bytes(32));
