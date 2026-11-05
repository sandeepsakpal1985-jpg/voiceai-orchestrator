<?php
require __DIR__.'/bootstrap.php';
define('CRM_ENTRY',true);
if(!crm_queue_ready()) {
    if($admin){header('Location: update.php');exit;}
    http_response_code(503);exit('Ask admin to complete the CRM update.');
}
$id=(int)($_GET['id']??0);
if(!$admin) {
    // Agents cannot choose a language/campaign or inspect another record's script.
    $state=crm_queue_state();
    if(!$id)$id=(int)($state['active_lead_id']??0);
}
$scriptCampaign='';
if($id) {
    try {$scriptRecord=lead($id);$scriptCampaign=$scriptRecord['campaign'];}
    catch(Throwable $ex){http_response_code(403);exit('Open Calling script from your current hospital workspace.');}
}
$scriptHinglish=$scriptCampaign==='India';
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Klu Care Calling Script | Talkvia</title><link rel="stylesheet" href="style.css?v=15"></head><body class="standalone-script"><header><span class="brand">Talkvia <span>Calling script</span></span><span><?=e($identity['name'])?></span></header><main class="script-page-main"><?php if(!in_array($scriptCampaign,['US','India'],true)): ?><section class="panel"><h1>Calling script</h1><p>Open a US or India hospital record and click Calling script. For an Unassigned hospital, set its campaign first.</p></section><?php else: ?><p class="badge"><?=e($scriptCampaign)?> campaign · <?=$scriptHinglish?'Hinglish':'English'?></p><?php require __DIR__.($scriptHinglish?'/calling-script-hinglish.php':'/calling-script.php'); endif ?></main></body></html>
