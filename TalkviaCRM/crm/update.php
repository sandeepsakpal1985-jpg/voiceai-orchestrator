<?php
require __DIR__.'/bootstrap.php';
if (!$admin) { http_response_code(403); exit('Ask admin to complete the CRM update.'); }
$error='';
if ($_SERVER['REQUEST_METHOD']==='POST') {
    if (!hash_equals($_SESSION['crm_csrf'],(string)($_POST['csrf']??''))) { http_response_code(403);exit('Reload this page.'); }
    try {
        if (!query("SHOW COLUMNS FROM sales_crm_leads LIKE 'timezone'")->get_result()->num_rows) {
            query("ALTER TABLE sales_crm_leads ADD COLUMN timezone VARCHAR(100) NOT NULL DEFAULT '' AFTER phone");
        }
        if (!query("SHOW COLUMNS FROM sales_crm_leads LIKE 'queue_due_at'")->get_result()->num_rows) {
            query('ALTER TABLE sales_crm_leads ADD COLUMN queue_due_at DATETIME NULL, ADD INDEX crm_queue_pick (assigned_to,queue_due_at,id)');
            query("UPDATE sales_crm_leads SET queue_due_at=CASE WHEN status IN ('Callback Requested','Follow-up Required','Interested','Information Requested') THEN callback_at WHEN status='Demo Scheduled' THEN demo_at WHEN status IN ('Busy','No Answer','Voicemail') THEN UTC_TIMESTAMP()+INTERVAL 4 HOUR ELSE NULL END");
        }
        foreach(explode(';',file_get_contents(__DIR__.'/schema.sql')) as $sql) if(trim($sql)!=='') $conn->query($sql);
        if(!query("SHOW INDEX FROM sales_crm_agent_state WHERE Key_name='crm_one_active_lead'")->get_result()->num_rows) {
            // Remove obsolete reservations only; never delete hospitals or history.
            query("UPDATE sales_crm_agent_state s LEFT JOIN sales_crm_leads l ON l.id=s.active_lead_id SET s.active_lead_id=NULL WHERE s.active_lead_id IS NOT NULL AND (l.id IS NULL OR l.assigned_to<>s.employee_id)");
            query('ALTER TABLE sales_crm_agent_state ADD UNIQUE KEY crm_one_active_lead (active_lead_id)');
        }
        if(!query("SHOW COLUMNS FROM sales_crm_leads LIKE 'campaign'")->get_result()->num_rows)query("ALTER TABLE sales_crm_leads ADD COLUMN campaign VARCHAR(20) NOT NULL DEFAULT 'Unassigned', ADD INDEX crm_campaign_queue (campaign,status,queue_due_at,id)");
        if(!query("SHOW COLUMNS FROM sales_crm_users LIKE 'campaign_access'")->get_result()->num_rows)query("ALTER TABLE sales_crm_users ADD COLUMN campaign_access VARCHAR(20) NOT NULL DEFAULT 'None'");
        $_SESSION['crm_message']='Campaign update complete. Set agent campaign access in Manage agents and classify old Unassigned hospitals in the pipeline. CRM updated. Existing records are preserved. Common lead pool and automatic allocation are ready. No manual assignment is required.';
        header('Location: index.php');exit;
    } catch (Throwable $ex) { error_log('CRM update: '.$ex->getMessage());$error='Could not complete update. Check that the database user has ALTER permission, then retry.'; }
}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Update CRM</title><link rel="stylesheet" href="style.css?v=5"></head><body><main style="max-width:600px"><section class="panel"><h1>Update your CRM</h1><p>Adds US / India campaign pools. Existing agents start with no campaign access and old hospitals stay Unassigned until you classify them. Enables the common lead pool and prevents duplicate active allocations across agents. Existing hospitals, users and history remain saved.</p><?php if($error): ?><div class="alert error"><?=e($error)?></div><?php endif ?><form method="post"><?=csrf()?><button>Complete update</button></form></section></main></body></html>
