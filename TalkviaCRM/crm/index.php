<?php
define('CRM_ENTRY', true);
require __DIR__.'/bootstrap.php';
if (!query("SHOW COLUMNS FROM sales_crm_leads LIKE 'timezone'")->get_result()->num_rows || !crm_queue_ready()) {
    if ($admin) { header('Location: update.php'); exit; }
    http_response_code(503); exit('CRM update pending. Ask admin to log in and complete the update.');
}
if(!$admin) {
    $queueState=crm_queue_state();
    $requestedId=(int)($_GET['id']??$_POST['id']??0);
    if($queueState['mode']!=='ready' || !$queueState['active_lead_id'] || $requestedId!==(int)$queueState['active_lead_id']) {
        if($_SERVER['REQUEST_METHOD']==='POST') {
            // A stale tab must never write into the newly allocated lead.
            $_SESSION['crm_message']='Your previous form is no longer the current queue record. That submission was not saved. Your current workspace has been opened.';
        }
        header('Location: work.php',true,303);exit;
    }
}
$error=''; require __DIR__.'/actions.php';
$ready=true;
try { query('SELECT id FROM sales_crm_leads LIMIT 1'); query('SELECT id FROM sales_crm_activity LIMIT 1'); query('SELECT id FROM sales_crm_emails LIMIT 1'); }
catch (Throwable $ex) { $ready=false; }
$id=(int)($_GET['id']??$_POST['id']??0); $record=null;
if ($ready && $id) { try { $record=lead($id); } catch (Throwable $ex) { if(!$admin){header('Location: work.php');exit;} http_response_code(404); $error='Record not found or not assigned to you.'; } }
$isNew=$admin && isset($_GET['new']);
// Keep unsaved input visible after a validation failure, including concurrency conflicts.
if ($error && in_array(($_POST['action']??''),['save','save_draft','compose_email','save_call_stay'],true) && ($record || $isNew)) {
    foreach (['hospital_name','address','city','state','phone','source_name','source_title','source_email','alternate_phone','status','current_software','requirements','notes','assigned_to','timezone','campaign','version'] as $k) {
        if ($k==='assigned_to' || (!$admin && array_key_exists($k,crm_hospital_fields()))) continue;
        $record[$k]=$_POST[$k]??($record[$k]??'');
    }

}
$previousSources=[];
if($record && $id) {
    $savedCalls=query("SELECT a.details,a.created_at,a.employee_id,u.name AS agent_name FROM sales_crm_activity a LEFT JOIN sales_crm_users u ON u.employee_id=a.employee_id WHERE a.lead_id=? AND a.action='Call attempt' ORDER BY a.id DESC LIMIT 100",[$id])->get_result();
    $seenSources=[];
    foreach($savedCalls as $savedCall) {
        $saved=json_decode($savedCall['details'],true);$contact=$saved['call']??null;
        if(!is_array($contact))continue;
        $key=hash('sha256',json_encode([$contact['source_name']??'',$contact['source_title']??'',$contact['source_email']??'',$contact['number_dialed']??'']));
        if(isset($seenSources[$key]))continue;
        $seenSources[$key]=true;$previousSources[]=['contact'=>$contact,'entry'=>$savedCall];
        if(count($previousSources)>=10)break;
    }
}
$hospitalZone=crm_valid_zone((string)($record['timezone']??''))?(string)$record['timezone']:'';
$appointmentInputs=[];
foreach(['callback_at','demo_at'] as $field) {
    $appointmentInputs[$field]=($error && in_array($_POST['action']??'',['save','save_draft','compose_email','save_call_stay'],true) && array_key_exists($field,$_POST))?substr((string)$_POST[$field],0,30):crm_local_input($record[$field]??null,$hospitalZone);
}
$dialedNumberValue=($record['alternate_phone']??'')?:($record['phone']??'');
if((int)($_SESSION['crm_dialed_number']['lead_id']??0)===$id)$dialedNumberValue=(string)($_SESSION['crm_dialed_number']['number']??$dialedNumberValue);
if($error && isset($_POST['call_number']))$dialedNumberValue=substr((string)$_POST['call_number'],0,50);
function inputfield(string $key,string $label,string $type='text',int $max=255,bool $required=false): void {
    global $record;
    echo '<label>'.e($label).($required?' *':'').'<input name="'.e($key).'" type="'.e($type).'" maxlength="'.$max.'" value="'.e($record[$key]??'').'"'.($required?' required':'').'></label>';
}
function renderActivity(string $details): void {
    $decoded=json_decode($details,true);
    if (!is_array($decoded) || !isset($decoded['changes'])) { echo '<p>'.nl2br(e($details)).'</p>'; return; }
    if (!empty($decoded['contacted'])) echo '<p class="call-log-note">Call attempt logged.</p>';
    if(!empty($decoded['call']) && is_array($decoded['call'])) {
        echo '<dl class="call-snapshot">';
        foreach(['number_dialed'=>'Number dialed','referred_number'=>'Referred number','source_name'=>'Source name','source_title'=>'Job title','source_email'=>'Email','outcome'=>'Outcome','notes'=>'Call notes'] as $field=>$label) echo '<div><dt>'.e($label).'</dt><dd>'.nl2br(e($decoded['call'][$field]??'—')).'</dd></div>';
        foreach(['callback_at_utc'=>'Callback','demo_at_utc'=>'Demo'] as $field=>$label) if(!empty($decoded['call'][$field])) {
            $zone=(string)($decoded['call']['hospital_timezone']??'');
            $local=crm_valid_zone($zone)?(new DateTimeImmutable($decoded['call'][$field],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($zone))->format('d M Y, h:i A T'):'IST: '.displaytime($decoded['call'][$field]);
            echo '<div><dt>'.e($label).'</dt><dd>'.e($local).'</dd></div>';
        }
        echo '</dl>';
    }
    if (!$decoded['changes']) { if(empty($decoded['contacted'])) echo '<p>Record saved; no field values changed.</p>'; return; }
    echo '<div class="table-wrap"><table><thead><tr><th>Field</th><th>Previous value</th><th>Updated value</th></tr></thead><tbody>';
    foreach($decoded['changes'] as $field=>$values) {
        echo '<tr><td>'.e(ucwords(str_replace('_',' ',$field))).'</td><td class="change-value">'.nl2br(e($values['from']??'—')).'</td><td class="change-value">'.nl2br(e($values['to']??'—')).'</td></tr>';
    }
    echo '</tbody></table></div>';
}
$message=$_SESSION['crm_message']??''; unset($_SESSION['crm_message']);
$baseWhere=$admin?'1=1':'assigned_to=?'; $baseParams=$admin?[]:[$employee];
$search=trim((string)($_GET['q']??'')); $filter=(string)($_GET['status']??''); $due=isset($_GET['due']); $campaignFilter=(string)($_GET['campaign']??'');
$rows=[]; $total=0; $stats=['total'=>0,'interested'=>0,'callbacks'=>0,'won'=>0];
if ($ready) {
    $stats=query("SELECT COUNT(*) total,COALESCE(SUM(status='Interested'),0) interested,COALESCE(SUM(callback_at<=UTC_TIMESTAMP() AND status IN ('Callback Requested','Follow-up Required')),0) callbacks,COALESCE(SUM(status='Closed Won'),0) won FROM sales_crm_leads WHERE $baseWhere",$baseParams)->get_result()->fetch_assoc();
    $where=$baseWhere; $params=$baseParams;
    if(in_array($campaignFilter,['US','India','Unassigned'],true)){$where.=' AND campaign=?';$params[]=$campaignFilter;}
    if ($search!=='') { $where.=' AND (hospital_name LIKE ? OR city LIKE ? OR phone LIKE ? OR source_name LIKE ?)'; for($n=0;$n<4;$n++) $params[]='%'.$search.'%'; }
    if (in_array($filter,$statuses,true)) { $where.=' AND status=?'; $params[]=$filter; }
    if ($due) $where.=" AND callback_at<=UTC_TIMESTAMP() AND status IN ('Callback Requested','Follow-up Required')";
    $total=(int)query("SELECT COUNT(*) n FROM sales_crm_leads WHERE $where",$params)->get_result()->fetch_assoc()['n'];
    $page=max(1,min((int)($_GET['page']??1),max(1,(int)ceil($total/30)))); $offset=($page-1)*30;
    $rows=query("SELECT * FROM sales_crm_leads WHERE $where ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET $offset",$params)->get_result()->fetch_all(MYSQLI_ASSOC);
}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hospital Sales CRM | Talkvia</title><link rel="stylesheet" href="style.css?v=14"></head><body>
<header><a href="index.php" class="brand">Talkvia <span>Sales CRM</span></a><div><?=e($identity['name'])?> <span class="badge"><?=e($role)?></span></div></header>
<div class="workspace"><aside class="crm-sidebar"><strong>Talkvia CRM</strong><small>SALES WORKSPACE</small><nav><?php if($admin): ?><a href="index.php">Hospital pipeline</a><a href="?due=1">Callbacks due</a><a href="reports.php">Calling reports</a><a href="queue-monitor.php">Agent availability</a><a href="users.php">Manage agents</a><a href="mail-settings.php">Email settings</a><?php else: ?><a href="work.php">My workspace</a><span class="badge">Ready · Auto-next</span><form method="post" action="work.php" class="break-controls"><?=csrf()?><input type="hidden" name="mode" value="break"><label>Break reason<select name="reason"><option>Tea / coffee</option><option>Lunch</option><option>Personal</option><option>Other</option></select></label><button type="submit" class="secondary">Take break</button></form><?php endif ?></nav><div class="sidebar-user"><?=e($identity['name'])?><small><?=e(ucfirst($role))?></small><form method="post" action="logout.php"><?=csrf()?><button class="secondary">Log out</button></form></div></aside><main><div class="heading page-heading"><div class="heading-copy"><p class="eyebrow">HOSPITAL SOFTWARE SALES</p><h1><?=$admin?'Hospital Sales CRM':'Agent call workspace'?></h1><p><?=$admin?'Hospitals, calls and follow-ups':'Dispose your current record to receive the next hospital from the common pool.'?></p></div>
<div class="world-clocks" role="group" aria-label="Current times in India and US time zones"><?php foreach(['Asia/Kolkata'=>'IST','America/New_York'=>'EST / EDT','America/Chicago'=>'CST / CDT','America/Denver'=>'MST / MDT','America/Los_Angeles'=>'PST / PDT'] as $zone=>$label): $now=new DateTimeImmutable('now',new DateTimeZone($zone)); ?><div class="zone-clock" data-timezone="<?=e($zone)?>" title="<?=e($zone)?>"><small><?=e($label)?></small><time datetime="<?=e($now->format(DateTimeInterface::ATOM))?>"><?=e($now->format('h:i A'))?></time><span><?=e($now->format('d M').' · '.($zone==='Asia/Kolkata'?'IST':$now->format('T')))?></span></div><?php endforeach ?></div></div>
<?php if($error): ?><div class="alert error" role="alert"><?=e($error)?></div><?php endif ?>
<?php if($message): ?><div class="alert" role="status"><?=e($message)?></div><?php endif ?>
<?php if(!$ready): ?><section class="panel"><h2>Database tables unavailable</h2><p>Contact your administrator to check the CRM database.</p></section>
<?php else: ?>
<?php if(!$record && !$isNew): ?><div class="stats"><div><small>Hospital pool</small><strong><?=e($stats['total'])?></strong></div><div><small>Interested</small><strong><?=e($stats['interested'])?></strong></div><a href="?due=1"><small>Callbacks due</small><strong><?=e($stats['callbacks'])?></strong></a><div><small>Closed won</small><strong><?=e($stats['won'])?></strong></div></div><?php endif ?>
<?php if($record || $isNew): ?>
<div class="workspace-tabbar"><div class="record-tabs" role="tablist" aria-label="Hospital workspace"><button type="button" role="tab" id="tab-details" aria-controls="pane-details" data-target="details">Call workspace</button><?php if($id && in_array($record['status'],$emailStatuses,true)): ?><button type="button" role="tab" id="tab-email" aria-controls="pane-email" data-target="email">Send email</button><?php endif ?><?php if($id): ?><button type="button" role="tab" id="tab-activity" aria-controls="pane-activity" data-target="activity">Call history</button><button type="button" role="tab" id="tab-emails" aria-controls="pane-emails" data-target="emails">Email history</button><?php endif ?></div><a class="script-button button secondary" href="script.php<?= $id?'?id='.e($id):'' ?>" target="_blank" rel="noopener noreferrer" title="Open calling script in a new tab">Calling script ↗</a></div>
<section class="panel" id="pane-details" role="tabpanel" aria-labelledby="tab-details" data-pane="details"><div class="heading"><div><p class="eyebrow"><?= $id?'RECORD #'.e($id):'NEW RECORD' ?></p><h2><?=e($record['hospital_name']??'Add a hospital')?></h2></div><?php if($admin): ?><a href="index.php">Back to hospitals</a><?php else: ?><span class="badge">Current queue record</span><?php endif ?></div>
<?php if(($record['status']??'')==='Do Not Call'): ?><div class="alert error">Do Not Call — do not call or email this contact.</div><?php endif ?>
<form method="post" id="lead-form"><?=csrf()?><input type="hidden" name="action" value="save"><input type="hidden" name="id" value="<?=e($id)?>"><input type="hidden" name="version" value="<?=e($record['version']??0)?>">
<section class="record-section hospital-section">
<div class="section-bar"><h3><span>01</span> Hospital details</h3><span class="section-note"><?=!$admin?'Read only · maintained by admin':'Hospital master · admin access'?></span></div>
<div class="master-layout"><fieldset <?=!$admin?'disabled':''?> class="hospital-master"><div class="master-grid">
<label>Campaign<select name="campaign" required><?php foreach(['Unassigned','US','India'] as $c): ?><option <?=($record['campaign']??'Unassigned')===$c?'selected':''?>><?=e($c)?></option><?php endforeach ?></select></label>
<?php inputfield('hospital_name','Hospital name','text',255,true); inputfield('phone','Phone number','tel',50,true); ?>
<label class="full-row">Address *<textarea name="address" maxlength="3000" rows="1" required><?=e($record['address']??'')?></textarea></label>
<?php inputfield('city','City','text',120,true); inputfield('state','State','text',120,true); ?>
<label class="full-row">Timezone<select name="timezone" id="hospital-timezone"><option value="">Not set — ask admin</option><?php $timezoneChoices=['America/New_York'=>'EST','America/Chicago'=>'CST','America/Denver'=>'MST','America/Los_Angeles'=>'PST','Asia/Kolkata'=>'IST']; if($hospitalZone && !isset($timezoneChoices[$hospitalZone]))$timezoneChoices[$hospitalZone]=crm_timezone_label($hospitalZone); foreach($timezoneChoices as $tz=>$tzLabel): ?><option value="<?=e($tz)?>" <?=($record['timezone']??'')===$tz?'selected':''?>><?=e($tzLabel)?></option><?php endforeach ?></select></label>
</div></fieldset>
<div class="hospital-clock"><small>HOSPITAL LOCAL TIME</small><strong id="hospital-clock" data-zone="<?=e($record['timezone']??'')?>"><?=e($hospitalZone?(new DateTimeImmutable('now',new DateTimeZone($hospitalZone)))->format('d M Y, h:i A T'):'Timezone not set')?></strong><span><?=e(crm_timezone_label($hospitalZone))?></span><hr><small>LAST CONTACT · IST</small><span><?=e(displaytime($record['last_contact_at']??null)?:'No call logged')?></span></div></div>
</section>
<div class="work-grid">
<section class="record-section source-section"><div class="section-bar"><h3><span>02</span> Source / contact</h3><span class="section-note">Person you spoke with</span></div><div class="section-fields">
<?php inputfield('source_name','Source name','text',160); inputfield('source_title','Job title','text',160); inputfield('source_email','Email address','email',254); ?>
<div class="source-email-action"><button type="submit" name="action" value="compose_email" id="source-email-button">Send email</button><small>Saves details and opens the email composer. Your current lead stays open.</small></div>
<?php inputfield('alternate_phone','Callback number','tel',50); ?><label>Number dialed<input type="tel" name="call_number" maxlength="50" value="<?=e($dialedNumberValue)?>" placeholder="Number used for this call"></label>
<p class="field-help">For a referral, enter the new number in Callback number. Keep Number dialed as the number just called.</p>
<?php if($id): ?><details class="previous-sources"><summary>Previous source details (<?=count($previousSources)?>)</summary><p class="muted">Latest saved call for up to 10 contacts. Full attempts remain in Call history.</p><?php if(!$previousSources): ?><p class="muted">No saved source snapshots yet.</p><?php endif ?><?php foreach($previousSources as $savedSource): $contact=$savedSource['contact'];$entry=$savedSource['entry']; ?><article class="previous-source"><strong><?=e(($contact['source_name']??'')?:'Name not captured')?></strong><small><?=e($contact['source_title']??'')?></small><dl><div><dt>Called</dt><dd><?=e($contact['number_dialed']??'—')?></dd></div><div><dt>Email</dt><dd><?=e(($contact['source_email']??'')?:'—')?></dd></div><div><dt>Outcome</dt><dd><?=e($contact['outcome']??'')?></dd></div><?php if(!empty($contact['referred_number'])): ?><div><dt>Referred to</dt><dd><?=e($contact['referred_number'])?></dd></div><?php endif ?></dl><p><?=nl2br(e($contact['notes']??''))?></p><small><?=e(displaytime($entry['created_at']))?> IST · <?=e($entry['agent_name']?:$entry['employee_id'])?></small></article><?php endforeach ?><button class="secondary" type="button" data-open-tab="activity">View full call history</button></details><?php endif ?>
<details class="extra-details"><summary>Software requirements</summary><?php inputfield('current_software','Current software'); ?><label>Requirements<textarea name="requirements" maxlength="5000" rows="3"><?=e($record['requirements']??'')?></textarea></label></details>
</div></section>
<section class="record-section outcome-section"><div class="section-bar"><h3><span>03</span> Call update</h3><span class="section-note">Outcome & next action</span></div><div class="section-fields">
<label>Call status<select name="status" id="status"><?php foreach($statuses as $st): ?><option <?=($record['status']??$statuses[0])===$st?'selected':''?>><?=e($st)?></option><?php endforeach ?></select></label>
<?php if($admin): ?><label>Current / last agent<input value="<?=e(($record['assigned_to']??'')?:'Not allocated yet')?>" disabled></label><?php endif ?>
<label>Callback · local<span class="datetime-control"><input type="datetime-local" name="callback_at" value="<?=e($appointmentInputs['callback_at'])?>" data-original-utc="<?=e($record['callback_at']??'')?>" data-original-zone="<?=e($hospitalZone)?>" data-original-value="<?=e(crm_local_input($record['callback_at']??null,$hospitalZone))?>" <?=!$hospitalZone?'disabled':''?>><small class="schedule-zone"><?=e($hospitalZone?crm_timezone_label($hospitalZone):'Timezone not set — ask admin')?></small></span></label>
<label>Demo · local<span class="datetime-control"><input type="datetime-local" name="demo_at" value="<?=e($appointmentInputs['demo_at'])?>" data-original-utc="<?=e($record['demo_at']??'')?>" data-original-zone="<?=e($hospitalZone)?>" data-original-value="<?=e(crm_local_input($record['demo_at']??null,$hospitalZone))?>" <?=!$hospitalZone?'disabled':''?>><small class="schedule-zone"><?=e($hospitalZone?crm_timezone_label($hospitalZone):'Timezone not set — ask admin')?></small></span></label>
<label class="notes-row">Comments<textarea name="notes" rows="3" maxlength="10000" placeholder="Conversation summary and next steps"><?=e($record['notes']??'')?></textarea></label>
<?php if($id && $admin): ?><label class="check"><input type="checkbox" name="contacted" value="1" <?=isset($_POST['contacted'])?'checked':''?>> Log this update as a call attempt</label><?php endif ?>
</div></section></div>
<div class="save-bar workspace-actions"><div><strong id="save-state">Ready</strong><small><?=$admin?'Review the call outcome before saving.':'Intermediate calls: Save call & stay. Final call: Dispose & next.'?></small></div><div class="action-buttons"><?php if($admin): ?><a class="button secondary" href="index.php">Back to list</a><?php else: ?><button class="secondary" name="action" value="save_draft">Save details</button><?php endif ?><?php if($id && in_array($record['status'],$emailStatuses,true)): ?><button class="secondary" type="button" data-open-tab="email">Compose email</button><?php endif ?><?php if($id): ?><button class="secondary stay-call-button" name="action" value="save_call_stay">Save call &amp; stay</button><?php endif ?><button><?=$admin?'Save call update':'Dispose & next hospital'?></button></div></div>
</form></section>
<?php if($id): ?>
<?php if(in_array($record['status'],$emailStatuses,true)): ?>
<?php
$emailRecipientsDefault = (($_POST['action'] ?? '') === 'email')
    ? (string)($_POST['recipients'] ?? '')
    : (string)($record['source_email'] ?? '');
?>
<section class="panel" id="pane-email" role="tabpanel" aria-labelledby="tab-email" data-pane="email"><h2>Send email</h2><p>Edit the To field freely. Prefills from source email when present. Separate multiple recipients with <strong>;</strong></p>
<?php $_SESSION['crm_email_token']=$_SESSION['crm_email_token']??bin2hex(random_bytes(24)); ?>
<form method="post" id="email-form"><?=csrf()?><input type="hidden" name="action" value="email"><input type="hidden" name="id" value="<?=e($id)?>"><input type="hidden" name="email_token" value="<?=e($_SESSION['crm_email_token'])?>"><label>To (recipients)<input name="recipients" id="email-recipients" type="text" maxlength="1000" required placeholder="name@hospital.com; other@hospital.com" value="<?=e($emailRecipientsDefault)?>"></label><label>Subject<input name="subject" maxlength="255" required value="<?=e(($_POST['action']??'')==='email'?($_POST['subject']??''):'Hospital software — further information')?>"></label><label>Message<textarea name="body" rows="7" maxlength="15000" required><?=e(($_POST['action']??'')==='email'?($_POST['body']??''):"Dear ".($record['source_name']?:'Team').",\n\nThank you for your time. Following our conversation about your hospital software requirements, we would be pleased to discuss the next steps and arrange a demonstration at a convenient time.\n\nPlease let us know your availability.\n\nKind regards,\n".$identity['name'])?></textarea></label><button>Send email</button><p class="muted">Sent from the configured sales mailbox (sales@klucare.com). Up to 10 recipients. Mail-server acceptance does not confirm inbox delivery.</p></form></section>
<?php endif ?>
<section class="panel" id="pane-activity" role="tabpanel" aria-labelledby="tab-activity" data-pane="activity"><h2>Call & change history</h2><?php $history=query('SELECT a.*,e.name FROM sales_crm_activity a LEFT JOIN sales_crm_users e ON e.employee_id=a.employee_id WHERE lead_id=? ORDER BY a.id DESC LIMIT 100',[$id])->get_result(); foreach($history as $entry): ?><article class="history"><strong><?=e($entry['action'])?></strong> · <?=e($entry['name']?:$entry['employee_id'])?> <small><?=e(displaytime($entry['created_at']))?> IST</small><details <?=($entry['action']==='Call attempt')?'open':''?>><summary>View details</summary><?php renderActivity($entry['details']); ?></details></article><?php endforeach ?><p class="muted">Showing the latest 100 activities.</p></section>
<section class="panel" id="pane-emails" role="tabpanel" aria-labelledby="tab-emails" data-pane="emails"><h2>Email history</h2><?php $mails=query('SELECT * FROM sales_crm_emails WHERE lead_id=? ORDER BY id DESC LIMIT 50',[$id])->get_result(); if(!$mails->num_rows): ?><p>No emails sent yet.</p><?php endif; foreach($mails as $m): ?><article class="history"><strong><?=e($m['subject'])?></strong><p><?=e($m['recipient'])?> · <?=e($m['employee_id'])?> · <span class="badge"><?=e($m['delivery_state'])?></span> · <?=e(displaytime($m['created_at']))?> IST</p><details><summary>View email</summary><pre><?=e($m['body'])?></pre></details></article><?php endforeach ?><p class="muted">Pending means sending was not confirmed. Check the mailbox before retrying. Latest 50 emails shown.</p></section>
<?php endif ?>
<?php else: ?>
<section class="panel"><div class="heading"><h2>Hospital pipeline <span class="badge"><?=e($total)?> records</span></h2><?php if($admin): ?><a class="button" href="?new=1">+ Add hospital</a><?php endif ?></div>
<form method="get" class="filters"><label>Search<input name="q" value="<?=e($search)?>" placeholder="Hospital, city, phone or contact"></label><label>Campaign<select name="campaign"><option value="">All campaigns</option><?php foreach(['US','India','Unassigned'] as $c):?><option <?=$campaignFilter===$c?'selected':''?>><?=e($c)?></option><?php endforeach ?></select></label><label>Status<select name="status"><option value="">All statuses</option><?php foreach($statuses as $s): ?><option <?=$filter===$s?'selected':''?>><?=e($s)?></option><?php endforeach ?></select></label><label class="check"><input type="checkbox" name="due" value="1" <?=$due?'checked':''?>> Callbacks due</label><button>Filter</button><a href="index.php">Reset</a></form>
<div class="table-wrap"><table><thead><tr><th>Hospital / location</th><th>Timezone</th><th>Phone</th><th>Source</th><th>Status</th><th>Callback · hospital local</th><th>Current / last agent</th><th></th></tr></thead><tbody><?php foreach($rows as $row): ?><tr><td><strong><?=e($row['hospital_name'])?></strong><span class="badge"><?=e($row['campaign'])?></span><small><?=e($row['city'].', '.$row['state'])?></small></td><td><?=e($row['timezone']?crm_timezone_label($row['timezone']):'Not set')?></td><td><?=e($row['phone'])?></td><td><?=e($row['source_name']?:'—')?><small><?=e($row['source_title'])?></small></td><td><span class="badge"><?=e($row['status'])?></span></td><td><?=e(($row['callback_at'] && crm_valid_zone($row['timezone']))?(new DateTimeImmutable($row['callback_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($row['timezone']))->format('d M Y, h:i A T'):($row['callback_at']?'Timezone not set':'—'))?><?php if($row['callback_at']): ?><small>IST: <?=e(displaytime($row['callback_at']))?></small><?php endif ?></td><td><?=e($row['assigned_to']?:'In common pool')?></td><td><a href="?id=<?=e($row['id'])?>">Open →</a></td></tr><?php endforeach; if(!$rows): ?><tr><td colspan="8"><div class="empty"><h3>No hospitals to display</h3><p><?=$admin?'Add a hospital or import your CSV to begin.':'No eligible hospitals in the common pool right now.'?></p></div></td></tr><?php endif ?></tbody></table></div>
<div class="pagination"><span>Page <?=e($page)?> of <?=e(max(1,ceil($total/30)))?></span><?php if($page>1): ?><a href="?<?=e(http_build_query(array_merge($_GET,['page'=>$page-1])))?>">Previous</a><?php endif; if($page*30<$total): ?><a href="?<?=e(http_build_query(array_merge($_GET,['page'=>$page+1])))?>">Next</a><?php endif ?></div></section>
<?php if($admin): ?><details class="panel"><summary>Classify old Unassigned hospitals</summary><p>For mixed data, open each hospital and set its campaign individually. Use this bulk action only if ALL Unassigned hospitals belong to one campaign.</p><form method="post" onsubmit="return confirm('Move ALL Unassigned hospitals to this campaign?')"><?=csrf()?><input type="hidden" name="action" value="classify_unassigned"><label>Campaign<select name="campaign" required><option value="">Select campaign</option><option>US</option><option>India</option></select></label><button>Move all Unassigned hospitals</button></form></details><details class="panel import-panel"><summary>Import hospital data</summary><p>Export Excel data as CSV UTF-8. Required: Hospital Name, Address, City, State, Phone Number. Timezone: enter EST, CST, MST, PST (or IST for India).</p><form method="post" enctype="multipart/form-data"><?=csrf()?><input type="hidden" name="action" value="import"><div class="grid"><label>Campaign<select name="campaign" required><option value="">Select campaign</option><option>US</option><option>India</option></select></label><label>CSV file (up to 5 MB / 5,000 rows)<input type="file" name="csv" accept=".csv,text/csv" required></label><div class="pool-info"><strong>Common lead pool</strong><p>Selected campaign applies to every row in this file. Only agents with access to that campaign receive these hospitals, one at a time.</p></div></div><button>Import hospitals</button> <a href="template.csv" download>Download CSV template</a></form><p class="muted">Same hospital name and phone within the selected campaign are skipped as duplicates. Invalid rows stop the complete import.</p></details><?php endif ?>
<?php endif; endif ?>
<footer>Talkvia · Hospital Sales CRM · Callback & demo inputs: hospital local time · IST shown for reference</footer></main></div>
<script>
const leadForm=document.getElementById('lead-form');let dirty=false;
leadForm?.addEventListener('input',()=>{dirty=true;const state=document.getElementById('save-state');if(state){state.textContent='Unsaved changes';state.classList.add('unsaved');}});
leadForm?.addEventListener('submit',()=>dirty=false);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
document.getElementById('email-form')?.addEventListener('submit',e=>{
 if(dirty){e.preventDefault();alert('Save your hospital changes before sending email.');return;}
 const to=(document.getElementById('email-recipients')?.value||'').trim();
 if(!to){e.preventDefault();alert('Enter at least one recipient in To.');return;}
 if(!confirm('Send this email to:\n'+to+'?')){e.preventDefault();return;}
 const b=e.target.querySelector('button');b.disabled=true;b.textContent='Sending…';
});
const statusField=document.getElementById('status');
function requirements(){if(!leadForm)return;leadForm.elements.callback_at.required=statusField.value==='Callback Requested';leadForm.elements.demo_at.required=statusField.value==='Demo Scheduled';}
statusField?.addEventListener('change',requirements);requirements();

const tabs=[...document.querySelectorAll('[data-target]')];
function selectTab(name,focus=false){
 if(!tabs.some(b=>b.dataset.target===name))name='details';
 tabs.forEach(b=>{const selected=b.dataset.target===name;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;if(selected&&focus)b.focus();});
 document.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==name);
}
document.querySelectorAll('[data-open-tab]').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.openTab,true)));
tabs.forEach((b,i)=>{b.addEventListener('click',()=>selectTab(b.dataset.target));b.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%tabs.length;if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;if(n!==undefined){e.preventDefault();selectTab(tabs[n].dataset.target,true);}});});
if(tabs.length)selectTab(<?=json_encode(($_POST['action']??'')==='email' || isset($_GET['compose'])?'email':'details')?>);
const clock=document.getElementById('hospital-clock');
const zoneSelect=document.getElementById('hospital-timezone');
// Interpret datetime-local in the selected hospital zone, never the browser zone.
function zonedParts(date,zone){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
 return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function zonedValue(date,zone){const p=zonedParts(date,zone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
function hospitalInstants(value,zone){
 const naive=Date.parse(value+':00Z');if(!Number.isFinite(naive))return [];
 const offsets=new Set();
 for(let h=-48;h<=48;h+=6){const sample=naive+h*3600000;const p=zonedParts(new Date(sample),zone);offsets.add(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-sample);}
 return [...offsets].map(offset=>new Date(naive-offset)).filter(date=>zonedValue(date,zone)===value).sort((a,b)=>a-b);
}
function inputInstant(input,zone){
 if(input.value===input.dataset.originalValue && zone===input.dataset.originalZone && input.dataset.originalUtc)return [new Date(input.dataset.originalUtc.replace(' ','T')+'Z')];
 return hospitalInstants(input.value,zone);
}
function hospitalTime(){
 const zone=zoneSelect?.value||'';
 if(clock){try{clock.textContent=zone?new Intl.DateTimeFormat('en-GB',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date()):'Timezone not set';}catch{clock.textContent='Timezone unavailable';}}
 document.querySelectorAll('[name="callback_at"],[name="demo_at"]').forEach(input=>{
  input.disabled=!zone;
  const label=({'America/New_York':'EST','America/Chicago':'CST','America/Denver':'MST','America/Los_Angeles':'PST','Asia/Kolkata':'IST'})[zone]||zone;
  input.parentElement.querySelector('.schedule-zone').textContent=zone?'Hospital local: '+label:'Timezone not set — ask admin';
  let hint=input.parentElement.querySelector('.local-hint');
  if(!hint){hint=document.createElement('small');hint.className='local-hint';input.parentElement.append(hint);}
  if(!input.value || !zone){hint.textContent='';return;}
  try{const choices=inputInstant(input,zone);hint.textContent=choices.length===1?'IST: '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(choices[0]):(choices.length===0?'Invalid local time during a clock change.':'This hour occurs twice; choose another time.');}catch{hint.textContent='Check hospital timezone and time.';}
 });
}
let previousHospitalZone=zoneSelect?.value||'';
zoneSelect?.addEventListener('change',()=>{
 const nextZone=zoneSelect.value;
 // Re-project existing entered appointments when admin changes the zone.
 if(previousHospitalZone && nextZone)document.querySelectorAll('[name="callback_at"],[name="demo_at"]').forEach(input=>{if(!input.value)return;try{const choices=inputInstant(input,previousHospitalZone);if(choices.length===1)input.value=zonedValue(choices[0],nextZone);else input.value='';}catch{input.value='';}});
 if(!previousHospitalZone && nextZone)document.querySelectorAll('[name="callback_at"],[name="demo_at"]').forEach(input=>{if(!input.value && input.dataset.originalUtc)input.value=zonedValue(new Date(input.dataset.originalUtc.replace(' ','T')+'Z'),nextZone);});
 if(nextZone)previousHospitalZone=nextZone;hospitalTime();
});
hospitalTime();setInterval(hospitalTime,30000);
document.querySelectorAll('[name="callback_at"],[name="demo_at"]').forEach(i=>i.addEventListener('input',hospitalTime));

const emailSourceButton=document.getElementById('source-email-button');
const emailAllowedStatuses=<?=json_encode($emailStatuses)?>;
function updateSourceEmailButton(){
 if(!emailSourceButton || !leadForm)return;
 const field=leadForm.elements.source_email;
 const emailOK=!!field?.value.trim() && field.checkValidity();
 const allowed=emailAllowedStatuses.includes(leadForm.elements.status.value);
 emailSourceButton.disabled=!emailOK||!allowed;
 emailSourceButton.title=!allowed?'Email is unavailable for this contact status':(!emailOK?'Enter a valid source email address':'Save details and compose email');
}
leadForm?.elements.source_email?.addEventListener('input',updateSourceEmailButton);
statusField?.addEventListener('change',updateSourceEmailButton);
updateSourceEmailButton();

const worldClockFormats=[...document.querySelectorAll('[data-timezone]')].map(card=>{
 const zone=card.dataset.timezone;
 return {card,zone,time:new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:true}),date:new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'short'}),abbr:new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'short'})};
});
function updateWorldClocks(){
 const now=new Date();
 for(const {card,zone,time,date,abbr} of worldClockFormats){
  const clock=card.querySelector('time');clock.textContent=time.format(now);clock.dateTime=now.toISOString();
  const short=zone==='Asia/Kolkata'?'IST':abbr.formatToParts(now).find(p=>p.type==='timeZoneName')?.value||zone;
  card.querySelector('span').textContent=date.format(now)+' · '+short;
 }
}
updateWorldClocks();setInterval(updateWorldClocks,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateWorldClocks();});

</script></body></html>
