<?php
require __DIR__.'/bootstrap.php';
if (!$admin) { http_response_code(403); exit('Admin access required.'); }
if (!crm_queue_ready()) { header('Location: update.php'); exit; }
$error = '';
$message = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!hash_equals($_SESSION['crm_csrf'], (string)($_POST['csrf'] ?? ''))) {
            throw new RuntimeException('Reload the page and try again.');
        }
        $action = posttext('action', 30);
        if ($action === 'create') {
            $id = strtoupper(posttext('user_id', 100));
            $name = posttext('name', 160);
            $email = strtolower(posttext('email', 254));
            $password = (string)($_POST['password'] ?? '');
            $role = strtolower(posttext('role', 20));
            if (!in_array($role, ['admin', 'agent'], true)) {
                throw new RuntimeException('Choose Admin or Agent.');
            }
            if (!preg_match('/^[A-Z0-9_-]{2,40}$/', $id) || !$name || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('Enter a user ID (2–40 letters/numbers), name and valid email.');
            }
            // Temporary passwords may be shorter; first login forces a 12+ character password.
            if (strlen($password) < 8 || strlen($password) > 72) {
                throw new RuntimeException('Temporary password must be 8–72 characters.');
            }
            $access = $role === 'admin' ? 'Both' : crm_campaign_access_input();
            $hash = password_hash($password, PASSWORD_DEFAULT);
            query(
                "INSERT INTO sales_crm_users (employee_id,name,email,password_hash,campaign_access,role,active,must_change_password,created_at) VALUES (?,?,?,?,?,?,1,1,UTC_TIMESTAMP())",
                [$id, $name, $email, $hash, $access, $role]
            );
            if ($role === 'agent') {
                query("INSERT INTO sales_crm_agent_state (employee_id,mode,changed_at) VALUES (?,'offline',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE employee_id=VALUES(employee_id)", [$id]);
            }
            $_SESSION['crm_message'] = ucfirst($role).' account created. They must change the temporary password on first login.';
        } elseif ($action === 'campaign') {
            $id = posttext('user_id', 100);
            $access = crm_campaign_access_input();
            $conn->begin_transaction();
            crm_dispatch_lock();
            query("UPDATE sales_crm_users SET campaign_access=? WHERE employee_id=? AND role='agent'", [$access, $id]);
            $state = query('SELECT * FROM sales_crm_agent_state WHERE employee_id=? FOR UPDATE', [$id])->get_result()->fetch_assoc();
            if ($state && $state['active_lead_id']) {
                $current = query('SELECT campaign FROM sales_crm_leads WHERE id=?', [$state['active_lead_id']])->get_result()->fetch_assoc();
                if (!$current || !crm_campaign_allowed($access, $current['campaign'])) {
                    query('UPDATE sales_crm_agent_state SET active_lead_id=NULL WHERE employee_id=?', [$id]);
                    activity((int)$state['active_lead_id'], 'Campaign access changed', 'Agent '.$id.' access: '.$access.'. Reservation released.');
                }
            }
            $conn->commit();
            $_SESSION['crm_message'] = 'Campaign access updated.';
        } elseif ($action === 'toggle') {
            $id = posttext('user_id', 100);
            if ($id === $employee) throw new RuntimeException('You cannot disable your own account.');
            query('UPDATE sales_crm_users SET active=IF(active=1,0,1) WHERE employee_id=?', [$id]);
            $_SESSION['crm_message'] = 'Account access updated.';
        } elseif ($action === 'password') {
            $id = posttext('user_id', 100);
            $password = (string)($_POST['password'] ?? '');
            if (strlen($password) < 8 || strlen($password) > 72) {
                throw new RuntimeException('Temporary password must be 8–72 characters.');
            }
            $hash = password_hash($password, PASSWORD_DEFAULT);
            query('UPDATE sales_crm_users SET password_hash=?, must_change_password=1 WHERE employee_id=?', [$hash, $id]);
            if ($id === $employee) $_SESSION['crm_auth_key'] = hash('sha256', $hash);
            $_SESSION['crm_message'] = 'Temporary password set. They must change it on next login.';
        } else {
            throw new RuntimeException('Unknown action.');
        }
        header('Location: users.php');
        exit;
    } catch (Throwable $ex) {
        try { $conn->rollback(); } catch (Throwable $ignored) {}
        $error = $ex instanceof mysqli_sql_exception ? 'Could not save user. The ID or email may already exist.' : $ex->getMessage();
    }
}
$message = $_SESSION['crm_message'] ?? '';
unset($_SESSION['crm_message']);
$users = query('SELECT employee_id,name,email,role,active,campaign_access,must_change_password FROM sales_crm_users ORDER BY role,name')->get_result();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Users | Talkvia CRM</title>
  <link rel="stylesheet" href="style.css?v=5">
</head>
<body>
<header>
  <a href="index.php" class="brand">Talkvia <span>Sales CRM</span></a>
  <a class="button secondary" href="index.php">Back to CRM</a>
</header>
<main>
  <h1>Your sales team</h1>
  <p>Create CRM accounts. Temporary passwords can be 8+ characters; users must set a 12+ character password on first login.</p>
  <?php if ($error): ?><div class="alert error"><?=e($error)?></div><?php endif ?>
  <?php if ($message): ?><div class="alert"><?=e($message)?></div><?php endif ?>
  <section class="panel">
    <h2>Add a user</h2>
    <form method="post">
      <?=csrf()?>
      <input type="hidden" name="action" value="create">
      <div class="grid">
        <label>User ID<input name="user_id" required maxlength="40" placeholder="e.g. OM" pattern="[A-Za-z0-9_-]{2,40}"></label>
        <label>Full name<input name="name" required maxlength="160"></label>
        <label>Email / login<input type="email" name="email" required maxlength="254"></label>
        <label>Temporary password (8–72)<input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
        <label>Role
          <select name="role" required>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>Campaign access (agents)
          <select name="campaign_access">
            <option value="None">No campaign</option>
            <option>US</option>
            <option>India</option>
            <option value="Both" selected>US + India</option>
          </select>
        </label>
      </div>
      <button>Create account</button>
    </form>
  </section>
  <section class="panel">
    <h2>Accounts</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Login email</th>
            <th>Role / access</th>
            <th>Campaign</th>
            <th>Manage</th>
          </tr>
        </thead>
        <tbody>
        <?php foreach ($users as $u): ?>
          <tr>
            <td><?=e($u['name'])?><small><?=e($u['employee_id'])?><?=!empty($u['must_change_password']) ? ' · must change password' : ''?></small></td>
            <td><?=e($u['email'])?></td>
            <td><?=e($u['role'])?> · <?=$u['active'] ? 'Active' : 'Disabled'?></td>
            <td>
              <?php if ($u['role'] === 'agent'): ?>
                <form method="post">
                  <?=csrf()?>
                  <input type="hidden" name="action" value="campaign">
                  <input type="hidden" name="user_id" value="<?=e($u['employee_id'])?>">
                  <select name="campaign_access">
                    <?php foreach (['None' => 'No campaign', 'US' => 'US', 'India' => 'India', 'Both' => 'US + India'] as $key => $label): ?>
                      <option value="<?=e($key)?>" <?=$u['campaign_access'] === $key ? 'selected' : ''?>><?=e($label)?></option>
                    <?php endforeach ?>
                  </select>
                  <button>Save campaign</button>
                </form>
              <?php else: ?>
                All (admin)
              <?php endif ?>
            </td>
            <td>
              <?php if ($u['employee_id'] !== $employee): ?>
                <form method="post">
                  <?=csrf()?>
                  <input type="hidden" name="action" value="toggle">
                  <input type="hidden" name="user_id" value="<?=e($u['employee_id'])?>">
                  <button class="secondary"><?=$u['active'] ? 'Disable' : 'Enable'?></button>
                </form>
              <?php endif ?>
              <details>
                <summary style="margin-top:10px;cursor:pointer">Set temporary password</summary>
                <form method="post">
                  <?=csrf()?>
                  <input type="hidden" name="action" value="password">
                  <input type="hidden" name="user_id" value="<?=e($u['employee_id'])?>">
                  <label>Temporary password<input type="password" name="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
                  <button>Reset &amp; force change</button>
                </form>
              </details>
            </td>
          </tr>
        <?php endforeach ?>
        </tbody>
      </table>
    </div>
  </section>
</main>
</body>
</html>
