<?php
// Independent of form controls: agents never supply hospital master values.
function crm_hospital_fields(): array {
    return ['hospital_name'=>255,'address'=>3000,'city'=>120,'state'=>120,'phone'=>50,'timezone'=>100,'campaign'=>20];
}
function crm_hospital_values(array $before, array $posted, bool $isAdmin): array {
    $values=[];
    foreach (crm_hospital_fields() as $field=>$limit) {
        if (!$isAdmin) { $values[$field]=$before[$field]??''; continue; }
        $value=trim((string)($posted[$field]??''));
        if (strlen($value)>$limit) throw new RuntimeException('Hospital '.$field.' is too long.');
        if ($field==='campaign' && !in_array($value,['US','India','Unassigned'],true))throw new RuntimeException('Choose a valid campaign.');
        if ($field!=='timezone' && $value==='') throw new RuntimeException('Please complete all hospital details.');
        $values[$field]=$value;
    }
    if ($values['timezone']!=='' && !in_array($values['timezone'],DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC),true)) throw new RuntimeException('Choose a valid hospital timezone.');
    return $values;
}
