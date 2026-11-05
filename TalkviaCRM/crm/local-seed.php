<?php
/**
 * Local-only bootstrap for the Talkvia demo beside KluCRM.
 * Creates tables and an admin + sample agent if the database is empty.
 */
$cfg = require __DIR__ . '/config.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = new mysqli($cfg['host'], $cfg['username'], $cfg['password'], $cfg['database'], (int)($cfg['port'] ?? 3306));
$conn->set_charset('utf8mb4');
$conn->query("SET time_zone = '+00:00'");

foreach (explode(';', file_get_contents(__DIR__ . '/schema.sql')) as $sql) {
    $sql = trim($sql);
    if ($sql !== '') {
        $conn->query($sql);
    }
}

$users = (int)$conn->query('SELECT COUNT(*) n FROM sales_crm_users')->fetch_assoc()['n'];
if ($users === 0) {
    $adminHash = password_hash('TalkviaAdmin1!', PASSWORD_DEFAULT);
    $agentHash = password_hash('TalkviaAgent1!', PASSWORD_DEFAULT);
    $stmt = $conn->prepare("INSERT INTO sales_crm_users (employee_id,name,email,password_hash,campaign_access,role,active,created_at) VALUES (?,?,?,?,?,?,1,UTC_TIMESTAMP())");
    $adminId = 'ADMIN';
    $adminName = 'Talkvia Admin';
    $adminEmail = 'admin@talkvia.local';
    $adminAccess = 'Both';
    $adminRole = 'admin';
    $stmt->bind_param('ssssss', $adminId, $adminName, $adminEmail, $adminHash, $adminAccess, $adminRole);
    $stmt->execute();

    $agentId = 'AGENT01';
    $agentName = 'Demo Agent';
    $agentEmail = 'agent@talkvia.local';
    $agentAccess = 'Both';
    $agentRole = 'agent';
    $stmt->bind_param('ssssss', $agentId, $agentName, $agentEmail, $agentHash, $agentAccess, $agentRole);
    $stmt->execute();

    $conn->query("INSERT INTO sales_crm_agent_state (employee_id, mode, changed_at) VALUES ('AGENT01','ready',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE mode='ready', changed_at=UTC_TIMESTAMP()");
}

$leads = (int)$conn->query('SELECT COUNT(*) n FROM sales_crm_leads')->fetch_assoc()['n'];
if ($leads === 0) {
    $stmt = $conn->prepare("INSERT INTO sales_crm_leads (campaign,hospital_name,address,city,state,phone,timezone,status,requirements,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'New / Not Contacted','','','ADMIN',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
    $samples = [
        ['India', 'Sunrise Care Hospital', '12 MG Road', 'Bengaluru', 'KA', '+918012345678', 'Asia/Kolkata'],
        ['India', 'Harbour Clinic', '88 Marine Drive', 'Mumbai', 'MH', '+912212345678', 'Asia/Kolkata'],
        ['US', 'Lakeside Medical Center', '401 Lake Ave', 'Chicago', 'IL', '+13125550123', 'America/Chicago'],
        ['US', 'Pacific Family Health', '22 Market St', 'San Francisco', 'CA', '+14155550199', 'America/Los_Angeles'],
        ['US', 'Empire Care Group', '90 Broadway', 'New York', 'NY', '+12125550111', 'America/New_York'],
    ];
    foreach ($samples as $row) {
        $stmt->bind_param('sssssss', $row[0], $row[1], $row[2], $row[3], $row[4], $row[5], $row[6]);
        $stmt->execute();
    }
}

echo "Talkvia local seed complete.\n";
echo "Admin: admin@talkvia.local / TalkviaAdmin1!\n";
echo "Agent: agent@talkvia.local / TalkviaAgent1!\n";
echo "Hospitals: " . (int)$conn->query('SELECT COUNT(*) n FROM sales_crm_leads')->fetch_assoc()['n'] . "\n";
