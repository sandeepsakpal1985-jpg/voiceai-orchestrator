<?php
require __DIR__.'/bootstrap.php';
if ($_SERVER['REQUEST_METHOD']!=='POST' || !hash_equals($_SESSION['crm_csrf'],(string)($_POST['csrf']??''))) { http_response_code(403); exit('Invalid request.'); }
if(!$admin && crm_queue_ready()) { try { crm_queue_mode('offline','Logged out'); } catch(Throwable $ex) { error_log('CRM logout state: '.$ex->getMessage()); } }
$_SESSION=[];session_destroy();header('Location: login.php');exit;
