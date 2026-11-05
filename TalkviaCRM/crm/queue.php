<?php
function crm_queue_access(): string {
    global $employee;
    $user=query("SELECT campaign_access FROM sales_crm_users WHERE employee_id=? AND active=1",[$employee])->get_result()->fetch_assoc();
    return $user['campaign_access']??'None';
}
function crm_queue_ready(): bool {
    try {
        return crm_campaign_ready() && query("SHOW COLUMNS FROM sales_crm_leads LIKE 'queue_due_at'")->get_result()->num_rows>0
            && query("SHOW TABLES LIKE 'sales_crm_agent_state'")->get_result()->num_rows>0
            && query("SHOW TABLES LIKE 'sales_crm_agent_events'")->get_result()->num_rows>0
            && query("SHOW TABLES LIKE 'sales_crm_dispatch'")->get_result()->num_rows>0
            && query("SHOW INDEX FROM sales_crm_agent_state WHERE Key_name='crm_one_active_lead'")->get_result()->num_rows>0;
    } catch(Throwable $ex) { return false; }
}
function crm_queue_state(bool $lock=false): array {
    global $employee;
    query("INSERT INTO sales_crm_agent_state (employee_id,mode,changed_at) VALUES (?,'ready',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE employee_id=VALUES(employee_id)",[$employee]);
    return query('SELECT * FROM sales_crm_agent_state WHERE employee_id=?'.($lock?' FOR UPDATE':''),[$employee])->get_result()->fetch_assoc();
}
function crm_queue_mode(string $mode,string $reason=''): void {
    global $employee,$conn;
    if(!in_array($mode,['ready','break','offline'],true)) throw new RuntimeException('Invalid availability.');
    $conn->begin_transaction();
    try {
        $state=crm_queue_state(true);
        $access=crm_queue_access();
        if($state['mode']!==$mode) {
            query('UPDATE sales_crm_agent_state SET mode=?,break_reason=?,changed_at=UTC_TIMESTAMP() WHERE employee_id=?',[$mode,$reason,$employee]);
            query('INSERT INTO sales_crm_agent_events (employee_id,event,reason,lead_id,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',[$employee,$mode,$reason,$state['active_lead_id']]);
        }
        $conn->commit();
    } catch(Throwable $ex) {$conn->rollback();throw $ex;}
}
function crm_queue_claim(): ?int {
    global $employee,$conn;
    $conn->begin_transaction();
    try {
        // Serialize only the short allocation transaction across all agents.
        // An independent UNIQUE index on active_lead_id also forbids duplicates.
        if(!query('SELECT id FROM sales_crm_dispatch WHERE id=1 FOR UPDATE')->get_result()->fetch_assoc()) throw new RuntimeException('Queue dispatcher needs an admin update.');
        $state=crm_queue_state(true);
        $access=crm_queue_access();
        if($state['mode']!=='ready') {$conn->commit();return null;}
        if($state['active_lead_id']) {
            $row=query('SELECT id,assigned_to,campaign FROM sales_crm_leads WHERE id=? FOR UPDATE',[$state['active_lead_id']])->get_result()->fetch_assoc();
            if($row && $row['assigned_to']===$employee && crm_campaign_allowed($access,$row['campaign'])) {$conn->commit();return (int)$row['id'];}
            query('UPDATE sales_crm_agent_state SET active_lead_id=NULL WHERE employee_id=?',[$employee]);
        }
        // Common pool: previous/manual ownership never limits eligibility.
        $row=query("SELECT l.id FROM sales_crm_leads l WHERE l.campaign IN ('US','India') AND (?='Both' OR l.campaign=?) AND l.status NOT IN ('Do Not Call','Closed Won','Closed Lost','Not Interested','Wrong Number') AND (l.status='New / Not Contacted' OR l.queue_due_at<=UTC_TIMESTAMP()) AND NOT EXISTS (SELECT 1 FROM sales_crm_agent_state s WHERE s.active_lead_id=l.id) ORDER BY CASE WHEN l.status='New / Not Contacted' THEN 1 ELSE 0 END,COALESCE(l.queue_due_at,l.created_at),l.id LIMIT 1 FOR UPDATE",[$access,$access])->get_result()->fetch_assoc();
        if(!$row) {$conn->commit();return null;}
        query('UPDATE sales_crm_agent_state SET active_lead_id=? WHERE employee_id=?',[$row['id'],$employee]);
        query('UPDATE sales_crm_leads SET assigned_to=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=?',[$employee,$row['id']]);
        query("INSERT INTO sales_crm_agent_events (employee_id,event,lead_id,created_at) VALUES (?,'record_opened',?,UTC_TIMESTAMP())",[$employee,$row['id']]);
        activity((int)$row['id'],'Auto-assigned','Campaign pool allocated to '.$employee.'.');
        $conn->commit();return (int)$row['id'];
    } catch(Throwable $ex) {$conn->rollback();throw $ex;}
}
function crm_queue_assert(int $id,bool $lock=false): void {
    global $admin;
    if($admin)return;
    if($lock)crm_dispatch_lock();
    $state=crm_queue_state($lock);
    if($state['mode']!=='ready' || (int)$state['active_lead_id']!==$id) throw new RuntimeException('This is not your current queue record. Return to My workspace.');
}
function crm_next_due(string $status,?string $callback,?string $demo): ?string {
    if(in_array($status,['Do Not Call','Closed Won','Closed Lost','Not Interested','Wrong Number'],true))return null;
    if($status==='Demo Scheduled')return $demo;
    if(in_array($status,['Callback Requested','Follow-up Required','Interested','Information Requested'],true))return $callback;
    if(in_array($status,['Busy','No Answer','Voicemail'],true))return gmdate('Y-m-d H:i:s',time()+($status==='Busy'?1800:14400));
    return null;
}
