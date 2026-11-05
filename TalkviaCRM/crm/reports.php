<?php
require __DIR__.'/bootstrap.php';
if (!$admin) { http_response_code(403); exit('Admin access required.'); }
if (!crm_queue_ready()) { header('Location: update.php'); exit; }

$tz = new DateTimeZone('Asia/Kolkata');
$today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');
$fromYmd = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['from'] ?? '')) ? (string)$_GET['from'] : (new DateTimeImmutable('now', $tz))->modify('-29 days')->format('Y-m-d');
$toYmd = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['to'] ?? '')) ? (string)$_GET['to'] : $today;
if ($fromYmd > $toYmd) { $tmp = $fromYmd; $fromYmd = $toYmd; $toYmd = $tmp; }

$startUtc = (new DateTimeImmutable($fromYmd.' 00:00:00', $tz))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
$endUtc = (new DateTimeImmutable($toYmd.' 00:00:00', $tz))->modify('+1 day')->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');

$agents = query("SELECT employee_id, name, campaign_access, active FROM sales_crm_users WHERE role='agent' ORDER BY name")->get_result()->fetch_all(MYSQLI_ASSOC);
$agentIds = array_column($agents, 'employee_id');

function empty_kpi(): array {
    return [
        'calls' => 0,
        'hospitals_called' => 0,
        'interested' => 0,
        'demo' => 0,
        'callback' => 0,
        'no_answer' => 0,
        'busy' => 0,
        'voicemail' => 0,
        'won' => 0,
        'lost' => 0,
        'dnc' => 0,
        'not_interested' => 0,
        'referred' => 0,
        'disposed' => 0,
        'breaks' => 0,
        'break_minutes' => 0,
        'break_tea' => 0,
        'break_lunch' => 0,
        'break_personal' => 0,
        'break_other' => 0,
        'records_opened' => 0,
    ];
}

$byAgent = [];
foreach ($agents as $agent) {
    $byAgent[$agent['employee_id']] = empty_kpi();
}

$callRows = query(
    "SELECT employee_id, lead_id, details FROM sales_crm_activity WHERE action='Call attempt' AND created_at >= ? AND created_at < ?",
    [$startUtc, $endUtc]
)->get_result();
$hospitalsTouched = [];
while ($row = $callRows->fetch_assoc()) {
    $id = $row['employee_id'];
    if (!isset($byAgent[$id])) continue;
    $byAgent[$id]['calls']++;
    $hospitalsTouched[$id][$row['lead_id']] = true;
    $decoded = json_decode((string)$row['details'], true);
    $outcome = (string)(($decoded['call']['outcome'] ?? '') ?: '');
    if ($outcome === 'Interested' || $outcome === 'Information Requested') $byAgent[$id]['interested']++;
    elseif ($outcome === 'Demo Scheduled') $byAgent[$id]['demo']++;
    elseif (in_array($outcome, ['Callback Requested', 'Follow-up Required'], true)) $byAgent[$id]['callback']++;
    elseif ($outcome === 'No Answer') $byAgent[$id]['no_answer']++;
    elseif ($outcome === 'Busy') $byAgent[$id]['busy']++;
    elseif ($outcome === 'Voicemail') $byAgent[$id]['voicemail']++;
    elseif ($outcome === 'Closed Won') $byAgent[$id]['won']++;
    elseif ($outcome === 'Closed Lost') $byAgent[$id]['lost']++;
    elseif ($outcome === 'Do Not Call') $byAgent[$id]['dnc']++;
    elseif ($outcome === 'Not Interested') $byAgent[$id]['not_interested']++;
    elseif ($outcome === 'Referred to Another Number') $byAgent[$id]['referred']++;
}
foreach ($hospitalsTouched as $id => $set) {
    $byAgent[$id]['hospitals_called'] = count($set);
}

$disposed = query(
    "SELECT employee_id, COUNT(*) c FROM sales_crm_agent_events WHERE event='disposed' AND created_at >= ? AND created_at < ? GROUP BY employee_id",
    [$startUtc, $endUtc]
)->get_result();
while ($row = $disposed->fetch_assoc()) {
    if (isset($byAgent[$row['employee_id']])) $byAgent[$row['employee_id']]['disposed'] = (int)$row['c'];
}

$opened = query(
    "SELECT employee_id, COUNT(*) c FROM sales_crm_agent_events WHERE event='record_opened' AND created_at >= ? AND created_at < ? GROUP BY employee_id",
    [$startUtc, $endUtc]
)->get_result();
while ($row = $opened->fetch_assoc()) {
    if (isset($byAgent[$row['employee_id']])) $byAgent[$row['employee_id']]['records_opened'] = (int)$row['c'];
}

// Break minutes: from each "break" event until next ready/offline/break (or range end).
$eventSql = "SELECT employee_id, event, reason, created_at FROM sales_crm_agent_events WHERE created_at >= ? AND created_at < ? AND event IN ('break','ready','offline') ORDER BY employee_id, id";
$events = query($eventSql, [$startUtc, $endUtc])->get_result()->fetch_all(MYSQLI_ASSOC);
$rangeEndTs = strtotime($endUtc.' UTC');
$openBreak = [];
foreach ($events as $ev) {
    $id = $ev['employee_id'];
    if (!isset($byAgent[$id])) continue;
    $ts = strtotime($ev['created_at'].' UTC');
    if ($ev['event'] === 'break') {
        if (isset($openBreak[$id])) {
            $mins = max(0, (int)floor(($ts - $openBreak[$id]['ts']) / 60));
            $byAgent[$id]['break_minutes'] += $mins;
            $reasonKey = $openBreak[$id]['reason'];
            if (isset($byAgent[$id][$reasonKey])) $byAgent[$id][$reasonKey] += $mins;
        }
        $byAgent[$id]['breaks']++;
        $reason = (string)$ev['reason'];
        $bucket = 'break_other';
        if ($reason === 'Tea / coffee') $bucket = 'break_tea';
        elseif ($reason === 'Lunch') $bucket = 'break_lunch';
        elseif ($reason === 'Personal') $bucket = 'break_personal';
        $openBreak[$id] = ['ts' => $ts, 'reason' => $bucket];
    } elseif (isset($openBreak[$id])) {
        $mins = max(0, (int)floor(($ts - $openBreak[$id]['ts']) / 60));
        $byAgent[$id]['break_minutes'] += $mins;
        $reasonKey = $openBreak[$id]['reason'];
        if (isset($byAgent[$id][$reasonKey])) $byAgent[$id][$reasonKey] += $mins;
        unset($openBreak[$id]);
    }
}
foreach ($openBreak as $id => $open) {
    $mins = max(0, (int)floor(($rangeEndTs - $open['ts']) / 60));
    $byAgent[$id]['break_minutes'] += $mins;
    if (isset($byAgent[$id][$open['reason']])) $byAgent[$id][$open['reason']] += $mins;
}

$totals = empty_kpi();
foreach ($byAgent as $kpi) {
    foreach ($totals as $key => $_) {
        $totals[$key] += $kpi[$key];
    }
}

function pct(?float $n): string {
    if ($n === null) return '—';
    return round($n * 100).'%';
}
function conversion(int $won, int $calls): ?float {
    if ($calls <= 0) return null;
    return $won / $calls;
}
function interest_rate(int $interested, int $calls): ?float {
    if ($calls <= 0) return null;
    return $interested / $calls;
}

if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="agent-kpis-'.$fromYmd.'-to-'.$toYmd.'.csv"');
    $out = fopen('php://output', 'w');
    fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));
    fputcsv($out, ['Agent','Employee ID','Campaign','Active','Calls','Hospitals called','Interested','Demo scheduled','Callbacks','No answer','Busy','Voicemail','Won','Lost','DNC','Not interested','Referred','Disposed','Records opened','Breaks','Break minutes','Tea min','Lunch min','Personal min','Other min','Conversion %','Interest %']);
    foreach ($agents as $agent) {
        $k = $byAgent[$agent['employee_id']];
        fputcsv($out, [
            $agent['name'],
            $agent['employee_id'],
            $agent['campaign_access'],
            $agent['active'] ? 'yes' : 'no',
            $k['calls'],
            $k['hospitals_called'],
            $k['interested'],
            $k['demo'],
            $k['callback'],
            $k['no_answer'],
            $k['busy'],
            $k['voicemail'],
            $k['won'],
            $k['lost'],
            $k['dnc'],
            $k['not_interested'],
            $k['referred'],
            $k['disposed'],
            $k['records_opened'],
            $k['breaks'],
            $k['break_minutes'],
            $k['break_tea'],
            $k['break_lunch'],
            $k['break_personal'],
            $k['break_other'],
            conversion($k['won'], $k['calls']) === null ? '' : round(conversion($k['won'], $k['calls']) * 100, 1),
            interest_rate($k['interested'], $k['calls']) === null ? '' : round(interest_rate($k['interested'], $k['calls']) * 100, 1),
        ]);
    }
    fclose($out);
    exit;
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Calling reports | Talkvia CRM</title>
  <link rel="stylesheet" href="style.css?v=5">
</head>
<body>
<header>
  <a href="index.php" class="brand">Talkvia <span>Sales CRM</span></a>
  <a href="index.php">Back to CRM</a>
</header>
<main>
  <section class="panel">
    <div class="heading">
      <div>
        <p class="eyebrow">ADMIN · ORG KPIs</p>
        <h1>Calling reports</h1>
        <p class="muted">Times use IST. Call counts come from logged call attempts. Breaks come from agent availability events.</p>
      </div>
      <a class="button secondary" href="?from=<?=e($fromYmd)?>&amp;to=<?=e($toYmd)?>&amp;export=csv">Download CSV</a>
    </div>
    <form method="get" class="grid" style="margin-top:1rem">
      <label>From<input type="date" name="from" value="<?=e($fromYmd)?>" required></label>
      <label>To<input type="date" name="to" value="<?=e($toYmd)?>" required></label>
      <label>&nbsp;<button type="submit">Apply range</button></label>
    </form>
  </section>

  <section class="panel">
    <h2>Organisation totals · <?=e($fromYmd)?> to <?=e($toYmd)?></h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px">
      <article class="history"><strong><?=e($totals['calls'])?></strong><p>Call attempts</p></article>
      <article class="history"><strong><?=e($totals['hospitals_called'])?></strong><p>Hospital touches*</p></article>
      <article class="history"><strong><?=e($totals['won'])?></strong><p>Closed won</p></article>
      <article class="history"><strong><?=e($totals['lost'])?></strong><p>Closed lost</p></article>
      <article class="history"><strong><?=e(pct(conversion($totals['won'], $totals['calls'])))?></strong><p>Conversion (won ÷ calls)</p></article>
      <article class="history"><strong><?=e($totals['interested'])?></strong><p>Interested / info</p></article>
      <article class="history"><strong><?=e(pct(interest_rate($totals['interested'], $totals['calls'])))?></strong><p>Interest rate</p></article>
      <article class="history"><strong><?=e($totals['demo'])?></strong><p>Demos scheduled</p></article>
      <article class="history"><strong><?=e($totals['callback'])?></strong><p>Callbacks / follow-ups</p></article>
      <article class="history"><strong><?=e($totals['disposed'])?></strong><p>Hospitals disposed</p></article>
      <article class="history"><strong><?=e($totals['breaks'])?></strong><p>Breaks taken</p></article>
      <article class="history"><strong><?=e($totals['break_minutes'])?>m</strong><p>Break time</p></article>
    </div>
    <p class="muted" style="margin-top:10px">*Hospital touches sums per-agent distinct hospitals; the same hospital called by two agents counts twice.</p>
  </section>

  <section class="panel">
    <h2>Break mix (minutes)</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px">
      <article class="history"><strong><?=e($totals['break_tea'])?>m</strong><p>Tea / coffee</p></article>
      <article class="history"><strong><?=e($totals['break_lunch'])?>m</strong><p>Lunch</p></article>
      <article class="history"><strong><?=e($totals['break_personal'])?>m</strong><p>Personal</p></article>
      <article class="history"><strong><?=e($totals['break_other'])?>m</strong><p>Other</p></article>
    </div>
  </section>

  <section class="panel">
    <h2>Agent performance</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Calls</th>
            <th>Hospitals</th>
            <th>Interested</th>
            <th>Demo</th>
            <th>Won</th>
            <th>Lost</th>
            <th>Conversion</th>
            <th>Disposed</th>
            <th>Breaks</th>
            <th>Break min</th>
          </tr>
        </thead>
        <tbody>
        <?php if (!$agents): ?>
          <tr><td colspan="11">No agents yet. Add them under Manage agents.</td></tr>
        <?php endif ?>
        <?php foreach ($agents as $agent): $k = $byAgent[$agent['employee_id']]; ?>
          <tr>
            <td>
              <strong><?=e($agent['name'])?></strong>
              <small><?=e($agent['employee_id'])?> · <?=e($agent['campaign_access'])?><?=$agent['active']?'':' · inactive'?></small>
            </td>
            <td><?=e($k['calls'])?></td>
            <td><?=e($k['hospitals_called'])?></td>
            <td><?=e($k['interested'])?></td>
            <td><?=e($k['demo'])?></td>
            <td><?=e($k['won'])?></td>
            <td><?=e($k['lost'])?></td>
            <td><?=e(pct(conversion($k['won'], $k['calls'])))?></td>
            <td><?=e($k['disposed'])?></td>
            <td><?=e($k['breaks'])?></td>
            <td><?=e($k['break_minutes'])?></td>
          </tr>
        <?php endforeach ?>
        </tbody>
      </table>
    </div>
  </section>

  <section class="panel">
    <h2>Outcome detail by agent</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Callback</th>
            <th>No answer</th>
            <th>Busy</th>
            <th>Voicemail</th>
            <th>Referred</th>
            <th>Not interested</th>
            <th>DNC</th>
            <th>Records opened</th>
          </tr>
        </thead>
        <tbody>
        <?php foreach ($agents as $agent): $k = $byAgent[$agent['employee_id']]; ?>
          <tr>
            <td><?=e($agent['name'])?></td>
            <td><?=e($k['callback'])?></td>
            <td><?=e($k['no_answer'])?></td>
            <td><?=e($k['busy'])?></td>
            <td><?=e($k['voicemail'])?></td>
            <td><?=e($k['referred'])?></td>
            <td><?=e($k['not_interested'])?></td>
            <td><?=e($k['dnc'])?></td>
            <td><?=e($k['records_opened'])?></td>
          </tr>
        <?php endforeach ?>
        </tbody>
      </table>
    </div>
  </section>
</main>
</body>
</html>
