<?php
$cfg = require '/var/www/crm.klucare.com/config.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$c = new mysqli($cfg['host'], $cfg['username'], $cfg['password'], $cfg['database'], (int)($cfg['port'] ?? 3306));
$c->query('ALTER TABLE sales_crm_emails MODIFY recipient VARCHAR(1000) NOT NULL');
echo "recipient column widened\n";
echo is_file('/var/www/crm.klucare.com/mail-config.php') ? "mail-config: present\n" : "mail-config: MISSING (configure Email settings)\n";
$row = $c->query("SHOW COLUMNS FROM sales_crm_emails LIKE 'recipient'")->fetch_assoc();
echo 'recipient type: ' . ($row['Type'] ?? '?') . "\n";
