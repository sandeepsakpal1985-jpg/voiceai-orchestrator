<?php
// All CRM writes use prepared statements and the existing CRM identity.
require_once __DIR__.'/session.php';
require_once __DIR__.'/hospital-policy.php';
require_once __DIR__.'/scheduling.php';
require_once __DIR__.'/queue.php';
require_once __DIR__.'/campaigns.php';
if (!is_file(__DIR__.'/config.php')) { header('Location: setup.php'); exit; }
if (empty($_SESSION['employee_id'])) { header('Location: login.php'); exit; }
$cfg = require __DIR__.'/config.php';
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
try { $conn = new mysqli($cfg['host'],$cfg['username'],$cfg['password'],$cfg['database'], (int)($cfg['port'] ?? 3306)); }
catch (Throwable $ex) { http_response_code(503); exit('CRM database is unavailable. Contact your administrator.'); }
$conn->set_charset('utf8mb4');
date_default_timezone_set('UTC'); // All CRM timestamps stored in UTC.
$conn->query("SET time_zone = '+00:00'");
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$employee = (string)$_SESSION['employee_id'];
// Re-read role to avoid granting access using an obsolete session role.
function query(string $sql, array $params = []): mysqli_stmt {
    global $conn;
    $stmt = $conn->prepare($sql);
    if ($params) $stmt->bind_param(str_repeat('s', count($params)), ...$params);
    $stmt->execute(); return $stmt;
}
$identity = query('SELECT employee_id,name,role,password_hash,must_change_password FROM sales_crm_users WHERE employee_id=? AND active=1', [$employee])->get_result()->fetch_assoc();
if (!$identity || !hash_equals(hash('sha256',$identity['password_hash']), (string)($_SESSION['crm_auth_key']??''))) { $_SESSION=[]; header('Location: login.php'); exit; }
$role = strtolower($identity['role']);
$admin = $role === 'admin';
if (!in_array($role, ['admin','agent'], true)) {
    http_response_code(403); exit('CRM access is unavailable for this role.');
}
$script = basename((string)($_SERVER['SCRIPT_NAME'] ?? ''));
if (!empty($identity['must_change_password']) && !in_array($script, ['change-password.php', 'logout.php'], true)) {
    header('Location: change-password.php');
    exit;
}
// Only admin has cross-team visibility. Other roles see only their assigned records.
$statuses = ['New / Not Contacted','Interested','Callback Requested','Information Requested','Demo Scheduled','Follow-up Required','Referred to Another Number','No Answer','Busy','Voicemail','Wrong Number','Not Interested','Do Not Call','Closed Won','Closed Lost'];
$emailStatuses = array_values(array_diff($statuses,['Do Not Call','Not Interested','Wrong Number','Closed Lost']));
$_SESSION['crm_csrf'] = $_SESSION['crm_csrf'] ?? bin2hex(random_bytes(32));
function e($value): string { return htmlspecialchars((string)($value ?? ''), ENT_QUOTES, 'UTF-8'); }
function csrf(): string { return '<input type="hidden" name="csrf" value="'.e($_SESSION['crm_csrf']).'">'; }
function lead(int $id, bool $lock = false): array {
    global $admin, $employee;
    crm_queue_assert($id,$lock);
    $row = query('SELECT * FROM sales_crm_leads WHERE id=?'.($lock ? ' FOR UPDATE' : ''), [$id])->get_result()->fetch_assoc();
    if (!$row || (!$admin && ($row['assigned_to'] !== $employee || !crm_campaign_allowed(crm_queue_access(),$row['campaign']??'')))) throw new RuntimeException('Record not found or not assigned to you.');
    return $row;
}
function activity(int $id, string $action, string $details): void {
    global $employee;
    query('INSERT INTO sales_crm_activity (lead_id,employee_id,action,details,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())', [$id,$employee,$action,$details]);
}
function posttext(string $name, int $max = 255): string {
    $value = trim((string)($_POST[$name] ?? ''));
    if (strlen($value) > $max) throw new RuntimeException($name.' is too long.');
    return $value;
}
function datetime_value(string $name,string $zone,?array $before=null): ?string {
    // Disabled fields on records with an unknown zone must not erase appointments.
    if(!array_key_exists($name,$_POST))return $before[$name]??null;
    $input=posttext($name,30);
    if($input==='' && !crm_valid_zone($before['timezone']??'') && !empty($before[$name]))return $before[$name];
    return crm_local_schedule($input,$zone,$before[$name]??null,$before['timezone']??'');
}
function displaytime(?string $v, bool $input = false): string {
    if (!$v) return '';
    return (new DateTimeImmutable($v, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Kolkata'))->format($input ? 'Y-m-d\TH:i' : 'd M Y, h:i A');
}
function check_owner(string $id): void {
    if ($id !== '' && !query('SELECT employee_id FROM sales_crm_users WHERE employee_id=? AND active=1', [$id])->get_result()->fetch_assoc()) throw new RuntimeException('Please select an active CRM user.');
}
