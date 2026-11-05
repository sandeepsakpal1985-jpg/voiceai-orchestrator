<?php
function crm_timezone_label(string $zone): string {
    $labels=['America/New_York'=>'EST','America/Chicago'=>'CST','America/Denver'=>'MST','America/Los_Angeles'=>'PST','Asia/Kolkata'=>'IST'];
    return $labels[$zone]??$zone;
}
function crm_import_timezone(string $value): string {
    $value=trim($value);
    $codes=['EST'=>'America/New_York','CST'=>'America/Chicago','MST'=>'America/Denver','PST'=>'America/Los_Angeles','IST'=>'Asia/Kolkata'];
    return $codes[strtoupper($value)]??$value;
}
function crm_valid_zone(string $zone): bool {
    return $zone!=='' && in_array($zone,DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC),true);
}
function crm_local_input(?string $utc,string $zone): string {
    if(!$utc || !crm_valid_zone($zone))return '';
    return (new DateTimeImmutable($utc,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone($zone))->format('Y-m-d\TH:i');
}
function crm_local_schedule(string $input,string $zone,?string $existingUtc=null,string $existingZone=''): ?string {
    if($input==='')return null;
    if(!crm_valid_zone($zone))throw new RuntimeException('Ask admin to set the hospital timezone before scheduling a callback or demo.');
    // Retain the exact instant (including an existing DST overlap occurrence).
    if($existingUtc && $zone===$existingZone && $input===crm_local_input($existingUtc,$zone))return $existingUtc;
    $naive=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$input,new DateTimeZone('UTC'));
    if(!$naive || $naive->format('Y-m-d\TH:i')!==$input)throw new RuntimeException('Enter a valid hospital-local date and time.');
    $tz=new DateTimeZone($zone);$epoch=$naive->getTimestamp();$offsets=[];
    $transitions=$tz->getTransitions($epoch-172800,$epoch+172800);
    foreach($transitions?:[] as $transition)$offsets[(string)$transition['offset']]=(int)$transition['offset'];
    $offsets[(string)$tz->getOffset($naive)]=$tz->getOffset($naive);
    $matches=[];
    foreach($offsets as $offset) {
        $candidate=(new DateTimeImmutable('@'.($epoch-$offset)))->setTimezone($tz);
        if($candidate->format('Y-m-d\TH:i')===$input)$matches[$candidate->getTimestamp()]=$candidate;
    }
    if(!$matches)throw new RuntimeException('That local time does not exist because of a daylight-saving clock change. Choose another time.');
    if(count($matches)>1)throw new RuntimeException('That local time occurs twice during a daylight-saving clock change. Choose a time outside the repeated hour.');
    return reset($matches)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
