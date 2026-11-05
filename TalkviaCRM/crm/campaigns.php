<?php
function crm_campaign_ready(): bool {
    return query("SHOW COLUMNS FROM sales_crm_leads LIKE 'campaign'")->get_result()->num_rows>0
        && query("SHOW COLUMNS FROM sales_crm_users LIKE 'campaign_access'")->get_result()->num_rows>0;
}
function crm_campaign_allowed(string $access,string $campaign): bool {
    return in_array($campaign,['US','India'],true) && ($access==='Both' || $access===$campaign);
}
function crm_campaign_input(string $name='campaign'): string {
    $value=posttext($name,20);
    if(!in_array($value,['US','India'],true))throw new RuntimeException('Select US or India campaign.');
    return $value;
}
function crm_campaign_access_input(): string {
    $value=posttext('campaign_access',20);
    if(!in_array($value,['None','US','India','Both'],true))throw new RuntimeException('Select valid campaign access.');
    return $value;
}
function crm_dispatch_lock(): void {
    if(!query('SELECT id FROM sales_crm_dispatch WHERE id=1 FOR UPDATE')->get_result()->fetch_assoc())throw new RuntimeException('Complete the CRM update.');
}
