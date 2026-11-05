<?php
$cfg = require '/var/www/crm.klucare.com/config.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$c = new mysqli($cfg['host'], $cfg['username'], $cfg['password'], $cfg['database'], (int)($cfg['port'] ?? 3306));
$c->set_charset('utf8mb4');
$r = $c->query("SELECT employee_id,name,email,role,active,must_change_password FROM sales_crm_users WHERE email IN ('om@klucare.com','ritika@klucare.com') ORDER BY email");
while ($row = $r->fetch_assoc()) {
    echo json_encode($row) . PHP_EOL;
}
$r = $c->query("SELECT email,password_hash FROM sales_crm_users WHERE email IN ('om@klucare.com','ritika@klucare.com')");
while ($row = $r->fetch_assoc()) {
    $ok = password_verify('TalkVia!1', $row['password_hash']) ? 'OK' : 'FAIL';
    echo $row['email'] . " password_verify: {$ok}" . PHP_EOL;
}
