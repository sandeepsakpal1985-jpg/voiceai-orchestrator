<?php
if (!defined('CRM_ENTRY')) exit;
if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
if (!hash_equals($_SESSION['crm_csrf'], (string)($_POST['csrf'] ?? ''))) {
    http_response_code(403); exit('Session token expired. Reload the page.');
}
$action = (string)($_POST['action'] ?? '');
$redirect = '';
try {
    if (in_array($action,['save','save_draft','compose_email','save_call_stay'],true)) {
        $disposing=!$admin && $action==='save';
        $stayingCall=$action==='save_call_stay';
        $id = (int)($_POST['id'] ?? 0);
        $conn->begin_transaction();
        crm_dispatch_lock();
        $before = $id ? lead($id, true) : null;
        if (!$before && !$admin) throw new RuntimeException('Only admin can create hospital records.');
        if ($before && (int)($_POST['version'] ?? 0) !== (int)$before['version']) throw new RuntimeException('This record changed. Reload it before saving. Copy your notes first.');
        if($stayingCall && !$before)throw new RuntimeException('Save the hospital first before logging a call.');
        $data = crm_hospital_values($before ?? [], $_POST, $admin);
        if($before && $admin && $before['campaign']!==$data['campaign']) {
            query('UPDATE sales_crm_agent_state SET active_lead_id=NULL WHERE active_lead_id=?',[$id]);
            activity($id,'Campaign changed',$before['campaign'].' to '.$data['campaign'].'. Reservation released.');
        }
        foreach (['source_name'=>160,'source_title'=>160,'source_email'=>254,'alternate_phone'=>50,'status'=>50,'current_software'=>255,'requirements'=>5000,'notes'=>10000] as $k=>$limit) $data[$k] = posttext($k,$limit);
        if (($disposing || $stayingCall) && $data['status']==='New / Not Contacted') throw new RuntimeException('Select the call outcome before logging this attempt.');
        if (!in_array($data['status'],$statuses,true)) throw new RuntimeException('Invalid call status.');
        if ($data['source_email'] !== '' && !filter_var($data['source_email'],FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Enter a valid source email address.');
        if($action==='compose_email' && (!filter_var($data['source_email'],FILTER_VALIDATE_EMAIL) || !in_array($data['status'],$emailStatuses,true))) throw new RuntimeException('Enter a valid source email and a contact status that allows email.');
        $data['callback_at'] = datetime_value('callback_at',$data['timezone'],$before);
        $data['demo_at'] = datetime_value('demo_at',$data['timezone'],$before);
        if(!crm_valid_zone($data['timezone']) && (($data['status']==='Callback Requested' && !$data['callback_at']) || ($data['status']==='Demo Scheduled' && !$data['demo_at']) || (($disposing || $stayingCall) && $data['status']==='Follow-up Required' && !$data['callback_at']))) throw new RuntimeException('Ask admin to set the hospital timezone before scheduling.');
        if (($data['status'] === 'Callback Requested' || (($disposing || $stayingCall) && $data['status']==='Follow-up Required')) && !$data['callback_at']) throw new RuntimeException('Choose the callback date and time.');
        if ($data['status'] === 'Demo Scheduled' && !$data['demo_at']) throw new RuntimeException('Choose the demo date and time.');
        if ($before && $before['status'] === 'Do Not Call' && !$admin && $data['status'] !== 'Do Not Call') throw new RuntimeException('Only admin may reopen a Do Not Call record.');
        $data['assigned_to'] = $before['assigned_to'] ?? ''; // Audit value; allocated only by the common-pool dispatcher.

        $data['queue_due_at']=($disposing || $stayingCall || $admin)?crm_next_due($data['status'],$data['callback_at'],$data['demo_at']):($before['queue_due_at']??null);
        if(($disposing || $stayingCall) && $data['queue_due_at']!==null && $data['queue_due_at']<=gmdate('Y-m-d H:i:s')) throw new RuntimeException('Choose a future callback/demo time before disposing this record.');
        $contacted=$disposing || $stayingCall || ($admin && isset($_POST['contacted']));
        $dialedNumber=posttext('call_number',50);
        if($dialedNumber==='')$dialedNumber=$data['alternate_phone']?:$data['phone'];
        $newSourceAfterReferral=$stayingCall && $data['status']==='Referred to Another Number';
        if($newSourceAfterReferral && $data['alternate_phone']==='')throw new RuntimeException('Enter the referred number in Callback number before saving this call.');
        $callSnapshot=$contacted?['number_dialed'=>$dialedNumber,'source_name'=>$data['source_name'],'source_title'=>$data['source_title'],'source_email'=>$data['source_email'],'outcome'=>$data['status'],'referred_number'=>$data['status']==='Referred to Another Number'?$data['alternate_phone']:'','notes'=>$data['notes'],'callback_at_utc'=>$data['callback_at'],'demo_at_utc'=>$data['demo_at'],'hospital_timezone'=>$data['timezone']]:null;
        if ($before) {
            $sets = implode(',',array_map(fn($k)=>"$k=?",array_keys($data)));
            query('UPDATE sales_crm_leads SET '.$sets.',last_contact_at=IF(?=1,UTC_TIMESTAMP(),last_contact_at),updated_at=UTC_TIMESTAMP(),version=version+1 WHERE id=?', [...array_values($data),$contacted?'1':'0',$id]);
            $changes = [];
            foreach ($data as $k=>$v) if ((string)$before[$k] !== (string)$v) $changes[$k] = ['from'=>$before[$k],'to'=>$v];
            activity($id, $contacted?'Call attempt':'Updated', json_encode(['changes'=>$changes,'contacted'=>$contacted,'call'=>$callSnapshot], JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT));
        } else {
            query('INSERT INTO sales_crm_leads ('.implode(',',array_keys($data)).',created_by,created_at,updated_at) VALUES ('.implode(',',array_fill(0,count($data),'?')).',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())', [...array_values($data),$employee]);
            $id = $conn->insert_id;
            activity($id,'Created','Hospital record added.');
        }
        if($newSourceAfterReferral) {
            // The completed call snapshot above is permanent. Reset only the next
            // contact draft, inside the same transaction; keep this reservation.
            query("UPDATE sales_crm_leads SET source_name='',source_title='',source_email='',notes='',status='New / Not Contacted',callback_at=NULL,demo_at=NULL,queue_due_at=NULL WHERE id=?",[$id]);
            activity($id,'New source ready','Previous source retained in call history. Next number: '.$data['alternate_phone']);
        }
        if($disposing) {
            query('UPDATE sales_crm_agent_state SET active_lead_id=NULL WHERE employee_id=?',[$employee]);
            query("INSERT INTO sales_crm_agent_events (employee_id,event,reason,lead_id,created_at) VALUES (?,'disposed',?,?,UTC_TIMESTAMP())",[$employee,$data['status'],$id]);
        }
        $conn->commit();
        $_SESSION['crm_dialed_number']=['lead_id'=>$id,'number'=>$newSourceAfterReferral?$data['alternate_phone']:$dialedNumber];
        if($disposing){unset($_SESSION['crm_dialed_number']);$_SESSION['crm_message']='Call disposition saved. Next hospital loaded automatically.';header('Location: work.php');exit;}
        $redirect = '?id='.$id.($action==='compose_email'?'&compose=1':'');
        $_SESSION['crm_message'] = $newSourceAfterReferral?'Referral call saved. Previous source details are below and in Call history. New source fields are blank; the referred number is ready in Number dialed.':($stayingCall?'Call attempt saved with its number, source, outcome and notes. This hospital stays open.':($action==='compose_email'?'Contact details saved. Review and send your email below.':'Hospital record saved.'));
    } elseif ($action === 'import') {
        if (!$admin) throw new RuntimeException('Only admin can import records.');
        if (($_FILES['csv']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw new RuntimeException('Choose a CSV file.');
        if ($_FILES['csv']['size'] > 5*1024*1024) throw new RuntimeException('CSV must be smaller than 5 MB.');
        $campaign=crm_campaign_input();
        $owner = ''; // Every imported hospital joins the common pool.
        $f = fopen($_FILES['csv']['tmp_name'],'r');
        // Consume UTF-8 BOM before CSV parsing (including quoted Excel headers).
        $prefix=fread($f,3); if ($prefix!=="\xEF\xBB\xBF") rewind($f);
        $header = fgetcsv($f,0,',','"','');
        if (!$header) throw new RuntimeException('CSV is empty.');
        $header[0] = preg_replace('/^\xEF\xBB\xBF/','',$header[0]);
        $header = array_map(fn($h)=>strtolower(trim($h)), $header);
        $required = ['hospital name','address','city','state','phone number'];
        foreach ($required as $h) if (!in_array($h,$header,true)) throw new RuntimeException('Missing CSV column: '.$h);
        $conn->begin_transaction(); $added=0; $skipped=0; $line=1;
        while (($row=fgetcsv($f,0,',','"','')) !== false) {
            $line++; if ($line>5001) throw new RuntimeException('Maximum 5,000 rows per import.');
            if (count($row)===1 && trim((string)$row[0])==='') continue;
            $v=[];
            foreach ($required as $h) $v[]=trim((string)($row[array_search($h,$header,true)] ?? ''));
            if (in_array('',$v,true)) throw new RuntimeException('Missing required value on CSV line '.$line.'. No records imported.');
            foreach ([255,3000,120,120,50] as $n=>$max) if (strlen($v[$n])>$max) throw new RuntimeException('Value too long on CSV line '.$line);
            $tzIndex=array_search('timezone',$header,true);
            $tz=$tzIndex===false?'':crm_import_timezone((string)($row[$tzIndex]??''));
            if ($tz!=='' && !in_array($tz,DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC),true)) throw new RuntimeException('Invalid timezone on CSV line '.$line.'. Use EST, CST, MST, PST or IST.');
            if (query('SELECT id FROM sales_crm_leads WHERE hospital_name=? AND phone=? AND campaign=? LIMIT 1',[$v[0],$v[4],$campaign])->get_result()->fetch_assoc()) { $skipped++; continue; }
            query("INSERT INTO sales_crm_leads (hospital_name,address,city,state,phone,timezone,campaign,assigned_to,requirements,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'','',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())",[...$v,$tz,$campaign,$owner,$employee]);
            activity($conn->insert_id,'Imported','Hospital imported from CSV.'); $added++;
        }
        fclose($f); $conn->commit();
        $_SESSION['crm_message'] = "$added hospitals imported; $skipped duplicates skipped (same hospital name and phone).";
    } elseif ($action === 'classify_unassigned') {
        if(!$admin)throw new RuntimeException('Admin access required.');
        $campaign=crm_campaign_input();
        $conn->begin_transaction();crm_dispatch_lock();
        query("UPDATE sales_crm_leads SET campaign=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE campaign='Unassigned'",[$campaign]);
        $count=$conn->affected_rows;
        $conn->commit();
        $_SESSION['crm_message']=$count.' unassigned hospitals moved to '.$campaign.'.';
    } elseif ($action === 'email') {
        $id=(int)($_POST['id']??0); $redirect='?id='.$id;
        $subject=posttext('subject',255); $body=posttext('body',15000);
        if ($subject==='' || $body==='' || preg_match('/[\r\n]/',$subject)) throw new RuntimeException('Enter a valid subject and message.');
        if (!hash_equals((string)($_SESSION['crm_email_token']??''),(string)($_POST['email_token']??''))) throw new RuntimeException('This send request was already used. Reload before sending again.');
        require_once __DIR__.'/mail.php';
        $toRaw = trim((string)($_POST['recipients'] ?? ''));
        if ($toRaw === '') $toRaw = trim((string)($_POST['source_email'] ?? ''));
        $recipients = crm_mail_parse_recipients($toRaw);
        $recipientList = implode('; ', $recipients);
        $conn->begin_transaction(); $record=lead($id,true);
        if (!in_array($record['status'],$emailStatuses,true)) throw new RuntimeException('Email is unavailable for this contact status.');
        $config = crm_mail_config();
        if (!crm_mail_ready($config)) throw new RuntimeException('SMTP is not configured. Ask admin to open Email settings and connect the Google Workspace mailbox.');
        $mail = crm_mailer($config, (string)$identity['name']);
        foreach ($recipients as $i => $to) {
            $name = ($i === 0 && strcasecmp($to, (string)$record['source_email']) === 0) ? (string)$record['source_name'] : '';
            $mail->addAddress($to, $name);
        }
        $mail->Subject = $subject;
        $mail->Body = $body;
        $mail->isHTML(false);
        query('INSERT INTO sales_crm_emails (lead_id,employee_id,recipient,subject,body,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())',[$id,$employee,$recipientList,$subject,$body]);
        $mailId=$conn->insert_id; $conn->commit();
        // Pending is retained if the request stops unexpectedly: do not auto-retry.
        unset($_SESSION['crm_email_token']);
        try {
            $mail->send();
        } catch (Throwable $ex) {
            query("UPDATE sales_crm_emails SET delivery_state='failed' WHERE id=?",[$mailId]);
            activity($id,'Email failed','Email to '.$recipientList.' was not confirmed by SMTP. Review before retrying.');
            error_log('CRM SMTP error: '.$ex->getMessage());
            throw new RuntimeException('Email sending was not confirmed. Review email history before retrying.');
        }
        query("UPDATE sales_crm_emails SET delivery_state='accepted',sent_at=UTC_TIMESTAMP() WHERE id=?",[$mailId]);
        activity($id,'Email accepted','SMTP accepted email to '.$recipientList.' | '.$subject);
        $_SESSION['crm_message']='Email accepted by the mail server for '.$recipientList.'. Delivery to inbox is not guaranteed.';
    } else throw new RuntimeException('Unknown action.');
    header('Location: index.php'.$redirect); exit;
} catch (Throwable $ex) {
    try { $conn->rollback(); } catch (Throwable $ignored) {}
    if ($ex instanceof RuntimeException && !($ex instanceof mysqli_sql_exception)) $error=$ex->getMessage();
    else { error_log('CRM error: '.$ex->getMessage()); $error='CRM could not complete this action. Contact admin; your update may need review.'; }
}
