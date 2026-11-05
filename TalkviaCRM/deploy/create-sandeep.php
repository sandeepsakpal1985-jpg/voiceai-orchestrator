<?php
$web = '/var/www/crm.klucare.com';
$cfg = require $web.'/config.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = new mysqli($cfg['host'], $cfg['username'], $cfg['password'], $cfg['database'], (int)($cfg['port'] ?? 3306));
$conn->set_charset('utf8mb4');

$cols = $conn->query("SHOW COLUMNS FROM sales_crm_users LIKE 'must_change_password'");
if ($cols->num_rows === 0) {
    $conn->query('ALTER TABLE sales_crm_users ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 AFTER active');
}

$id = 'SANDEEP';
$name = 'Sandeep';
$email = 'sandeep@klucare.com';
$role = 'admin';
$access = 'Both';
$temp = 'TalkVia!1';
$hash = password_hash($temp, PASSWORD_DEFAULT);

$stmt = $conn->prepare('SELECT employee_id FROM sales_crm_users WHERE email=? OR employee_id=? LIMIT 1');
$stmt->bind_param('ss', $email, $id);
$stmt->execute();
$existing = $stmt->get_result()->fetch_assoc();
if ($existing) {
    $stmt = $conn->prepare('UPDATE sales_crm_users SET name=?, email=?, password_hash=?, campaign_access=?, role=?, active=1, must_change_password=1 WHERE employee_id=?');
    $eid = $existing['employee_id'];
    $stmt->bind_param('ssssss', $name, $email, $hash, $access, $role, $eid);
    $stmt->execute();
    echo "Updated {$email} (admin) — temporary password + force change\n";
} else {
    $stmt = $conn->prepare('INSERT INTO sales_crm_users (employee_id,name,email,password_hash,campaign_access,role,active,must_change_password,created_at) VALUES (?,?,?,?,?,?,1,1,UTC_TIMESTAMP())');
    $stmt->bind_param('ssssss', $id, $name, $email, $hash, $access, $role);
    $stmt->execute();
    echo "Created {$email} (admin)\n";
}
echo "Temporary password: {$temp}\n";
echo "Must change password on first login.\n";
