<?php
require __DIR__.'/bootstrap.php';
if($admin){header('Location: index.php');exit;}
if(!crm_queue_ready()){http_response_code(503);exit('Ask admin to open CRM and complete the queue update.');}
$access=crm_queue_access();
$error='';
if($_SERVER['REQUEST_METHOD']==='POST') {
    if(!hash_equals($_SESSION['crm_csrf'],(string)($_POST['csrf']??''))){http_response_code(403);exit('Reload the page.');}
    try {
        $mode=posttext('mode',20);$reason=posttext('reason',80);
        if($mode==='break' && !in_array($reason,['Tea / coffee','Lunch','Personal','Other'],true))throw new RuntimeException('Choose a break reason.');
        crm_queue_mode($mode,$mode==='break'?$reason:'');
        header('Location: work.php');exit;
    } catch(Throwable $ex){$error='Unable to update availability. Please reload and try again.';error_log('CRM availability: '.$ex->getMessage());}
}
try {$next=crm_queue_claim();if($next){header('Location: index.php?id='.$next);exit;} $state=crm_queue_state();}
catch(Throwable $ex){http_response_code(503);exit('Queue is temporarily unavailable. Please reload or contact admin.');}
$message=$_SESSION['crm_message']??'';unset($_SESSION['crm_message']);
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My workspace | Talkvia CRM</title><link rel="stylesheet" href="style.css?v=5"></head><body><header><span class="brand">Talkvia <span>Sales CRM</span></span><span><?=e($identity['name'])?></span></header><main style="max-width:760px"><section class="panel queue-wait"><span class="badge"><?=e(ucfirst($state['mode']))?></span><p>Campaign access: <strong><?=e($access)?></strong></p><?php if($access==='None'):?><div class="alert">Ask admin to set your campaign access in Manage agents.</div><?php endif ?><h1><?=$state['mode']==='break'?'You are on a break':($state['mode']==='offline'?'Start your workspace':'No hospitals ready right now')?></h1>
<?php if($error):?><div class="alert error"><?=e($error)?></div><?php endif ?><?php if($message):?><div class="alert"><?=e($message)?></div><?php endif ?>
<?php if($state['mode']==='break'):?><p><?=e($state['break_reason'])?> · Since <?=e(displaytime($state['changed_at']))?> IST</p><p>Your current hospital stays reserved. Resume to continue the same record.</p><?php elseif($state['mode']==='offline'):?><p>Continue your current record or receive the next hospital from the common pool.</p><?php else:?><p>No free, eligible hospitals are available in your campaign pool. Other records may be reserved, completed or waiting for their callback time. This page checks again every 30 seconds.</p><?php endif ?>
<?php if($state['mode']!=='ready'):?><form method="post"><?=csrf()?><input type="hidden" name="mode" value="ready"><button><?=$state['mode']==='break'?'Resume work':'Start work'?></button></form><?php else:?><a class="button" href="work.php">Check queue</a><form method="post" class="break-controls"><?=csrf()?><input type="hidden" name="mode" value="break"><label>Break reason<select name="reason"><option>Tea / coffee</option><option>Lunch</option><option>Personal</option><option>Other</option></select></label><button class="secondary">Take break</button></form><?php endif ?>
<form method="post" action="logout.php" style="margin-top:20px"><?=csrf()?><button class="secondary">Log out</button></form></section></main><?php if($state['mode']==='ready'):?><script>setTimeout(()=>location.replace('work.php'),30000);</script><?php endif ?></body></html>
