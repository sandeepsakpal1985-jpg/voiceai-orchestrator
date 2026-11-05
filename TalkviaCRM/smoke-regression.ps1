$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8080'
$tmp = Join-Path $PSScriptRoot 'test-out'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$pass = 0
$fail = 0
$notes = New-Object System.Collections.Generic.List[string]

function Assert-True($cond, $name, $detail = '') {
  if ($cond) {
    $script:pass++
    Write-Host "PASS  $name"
  } else {
    $script:fail++
    Write-Host "FAIL  $name  $detail"
    $script:notes.Add("FAIL: $name — $detail")
  }
}

function Get-Csrf([string]$html) {
  if ($html -match 'name="csrf" value="([^"]+)"') { return $Matches[1] }
  return $null
}

function Login([string]$email, [string]$password, [string]$jar) {
  Remove-Item $jar -Force -ErrorAction SilentlyContinue
  $loginHtml = & curl.exe -s -c $jar -b $jar "$base/login.php"
  $csrf = Get-Csrf $loginHtml
  if (-not $csrf) { throw "No CSRF on login for $email" }
  $headers = Join-Path $tmp ("login-$email.hdr")
  & curl.exe -s -c $jar -b $jar -X POST "$base/login.php" `
    --data-urlencode "csrf=$csrf" `
    --data-urlencode "email=$email" `
    --data-urlencode "password=$password" `
    -D $headers -o NUL
  $loc = (Select-String -Path $headers -Pattern '^Location:\s*(.+)$' | Select-Object -First 1).Matches.Groups[1].Value.Trim()
  return $loc
}

function Fetch([string]$jar, [string]$path, [string]$outName) {
  $out = Join-Path $tmp $outName
  $code = & curl.exe -s -c $jar -b $jar -L --max-time 30 -o $out -w "%{http_code}" "$base$path"
  return @{ Code = $code; Path = $out; Html = (Get-Content -Raw $out) }
}

Write-Host "=== Talkvia CRM smoke + regression ==="
Write-Host "Base: $base"
Write-Host ""

# --- Unauthenticated ---
$code = & curl.exe -s --max-time 15 -o NUL -w "%{http_code}" "$base/login.php"
Assert-True ($code -eq '200') 'Login page loads' "got $code"

$code = & curl.exe -s --max-time 15 -o NUL -w "%{http_code}" -D (Join-Path $tmp 'reports-unauth.hdr') "$base/reports.php"
$loc = ''
if (Test-Path (Join-Path $tmp 'reports-unauth.hdr')) {
  $m = Select-String -Path (Join-Path $tmp 'reports-unauth.hdr') -Pattern '^Location:\s*(.+)$' | Select-Object -First 1
  if ($m) { $loc = $m.Matches.Groups[1].Value.Trim() }
}
Assert-True (($code -eq '302' -or $code -eq '303') -and ($loc -match 'login')) 'Reports requires login' "code=$code loc=$loc"

# --- Admin login ---
$adminJar = Join-Path $tmp 'admin.jar'
try {
  $adminLoc = Login 'admin@talkvia.local' 'TalkviaAdmin1!' $adminJar
  Assert-True ($adminLoc -match 'index\.php') 'Admin login redirects to pipeline' "loc=$adminLoc"
} catch {
  Assert-True $false 'Admin login' $_.Exception.Message
  Write-Host "Aborting remaining tests."
  exit 1
}

$adminHome = Fetch $adminJar '/index.php' 'admin-index.html'
Assert-True ($adminHome.Code -eq '200') 'Admin pipeline HTTP 200' "got $($adminHome.Code)"
Assert-True ($adminHome.Html -match 'Hospital pipeline') 'Admin sees Hospital pipeline'
Assert-True ($adminHome.Html -match 'Calling reports') 'Admin sidebar has Calling reports'
Assert-True ($adminHome.Html -match 'Manage agents') 'Admin sidebar has Manage agents'
Assert-True ($adminHome.Html -match 'Email settings') 'Admin sidebar has Email settings'
Assert-True ($adminHome.Html -match 'Agent availability') 'Admin sidebar has Agent availability'
Assert-True ($adminHome.Html -match 'Sunrise Care Hospital|Lakeside Medical|Harbour Clinic|Empire Care|Pacific Family') 'Admin pipeline lists sample hospitals'

$reports = Fetch $adminJar '/reports.php' 'admin-reports.html'
Assert-True ($reports.Code -eq '200') 'Admin reports HTTP 200' "got $($reports.Code)"
Assert-True ($reports.Html -match 'Calling reports') 'Reports page title present'
Assert-True ($reports.Html -match 'Organisation totals') 'Reports org totals section'
Assert-True ($reports.Html -match 'Agent performance') 'Reports agent performance table'
Assert-True ($reports.Html -match 'Demo Agent|AGENT01') 'Reports lists demo agent'
Assert-True ($reports.Html -match 'Download CSV') 'Reports has CSV download'

$csvCode = & curl.exe -s -c $adminJar -b $adminJar -L --max-time 30 -o (Join-Path $tmp 'kpis.csv') -w "%{http_code}" "$base/reports.php?export=csv"
$csvHead = Get-Content (Join-Path $tmp 'kpis.csv') -TotalCount 1 -ErrorAction SilentlyContinue
Assert-True ($csvCode -eq '200' -and $csvHead -match 'Agent') 'Reports CSV export' "code=$csvCode head=$csvHead"

$users = Fetch $adminJar '/users.php' 'admin-users.html'
Assert-True ($users.Code -eq '200') 'Manage agents HTTP 200' "got $($users.Code)"
Assert-True ($users.Html -match 'admin@talkvia.local|Demo Agent|agent@talkvia.local') 'Users page shows seeded accounts'

$monitor = Fetch $adminJar '/queue-monitor.php' 'admin-monitor.html'
Assert-True ($monitor.Code -eq '200') 'Queue monitor HTTP 200' "got $($monitor.Code)"
Assert-True ($monitor.Html -match 'Agent availability') 'Queue monitor heading'

$mail = Fetch $adminJar '/mail-settings.php' 'admin-mail.html'
Assert-True ($mail.Code -eq '200') 'Email settings HTTP 200' "got $($mail.Code)"
Assert-True ($mail.Html -match 'SMTP|Email|mailbox|Host' -or $mail.Html -match 'mail') 'Email settings page content'

# Admin must not get agent-only workspace claim flow as primary nav
Assert-True ($adminHome.Html -notmatch 'Dispose & next hospital') 'Admin home is pipeline not agent dispose UI'

# --- Agent login ---
$agentJar = Join-Path $tmp 'agent.jar'
try {
  $agentLoc = Login 'agent@talkvia.local' 'TalkviaAgent1!' $agentJar
  Assert-True ($agentLoc -match 'work\.php|index\.php') 'Agent login redirects to workspace' "loc=$agentLoc"
} catch {
  Assert-True $false 'Agent login' $_.Exception.Message
}

# Follow work.php to claim a hospital
$work = Fetch $agentJar '/work.php' 'agent-work.html'
# work.php may 302 to index.php?id=
$agentRecord = Fetch $agentJar '/index.php' 'agent-index.html'
if ($agentRecord.Html -match 'login\.php' -or $agentRecord.Code -eq '302') {
  # session might need work claim
}
# Prefer following redirects from work
$claimOut = Join-Path $tmp 'agent-claim.html'
$claimHdr = Join-Path $tmp 'agent-claim.hdr'
& curl.exe -s -c $agentJar -b $agentJar -D $claimHdr -o $claimOut --max-time 30 "$base/work.php"
$claimLoc = ''
$m = Select-String -Path $claimHdr -Pattern '^Location:\s*(.+)$' | Select-Object -First 1
if ($m) { $claimLoc = $m.Matches.Groups[1].Value.Trim() }
if ($claimLoc -match 'id=(\d+)') {
  $leadId = $Matches[1]
} else {
  # already on page or waiting
  $html = Get-Content -Raw $claimOut
  if ($html -match 'RECORD #(\d+)' -or $html -match 'name="id" value="(\d+)"') { $leadId = $Matches[1] } else { $leadId = $null }
  if (-not $leadId -and $html -match 'No hospitals ready') {
    Assert-True $true 'Agent queue empty or waiting (acceptable if all reserved)'
  }
}

if ($leadId) {
  Assert-True $true "Agent claimed hospital #$leadId"
  $page = Fetch $agentJar "/index.php?id=$leadId" 'agent-lead.html'
  Assert-True ($page.Code -eq '200') 'Agent record page HTTP 200' "got $($page.Code)"
  Assert-True ($page.Html -match 'Save call|Dispose|Call workspace') 'Agent sees call workspace actions'
  Assert-True ($page.Html -match 'Calling script') 'Agent sees Calling script button'
  Assert-True ($page.Html -notmatch 'Manage agents') 'Agent does not see Manage agents'
  Assert-True ($page.Html -notmatch 'Calling reports') 'Agent does not see Calling reports'

  # Save draft (POST to index.php — actions.php is included there)
  $csrf = Get-Csrf $page.Html
  $version = if ($page.Html -match 'name="version" value="(\d+)"') { $Matches[1] } else { '1' }
  $draftHdr = Join-Path $tmp 'draft.hdr'
  $draftBody = Join-Path $tmp 'draft.body.html'
  & curl.exe -s -c $agentJar -b $agentJar -X POST "$base/index.php?id=$leadId" `
    --data-urlencode "csrf=$csrf" `
    --data-urlencode "action=save_draft" `
    --data-urlencode "id=$leadId" `
    --data-urlencode "version=$version" `
    --data-urlencode "source_name=Regression Contact" `
    --data-urlencode "source_title=Director" `
    --data-urlencode "source_email=contact@example.com" `
    --data-urlencode "alternate_phone=" `
    --data-urlencode "status=New / Not Contacted" `
    --data-urlencode "current_software=" `
    --data-urlencode "requirements=" `
    --data-urlencode "notes=Smoke draft note" `
    --data-urlencode "callback_at=" `
    --data-urlencode "demo_at=" `
    --data-urlencode "call_number=" `
    -D $draftHdr -o $draftBody
  $draftLoc = ''
  $dm = Select-String -Path $draftHdr -Pattern '^Location:\s*(.+)$' | Select-Object -First 1
  if ($dm) { $draftLoc = $dm.Matches.Groups[1].Value.Trim() }
  $draftHtml = Get-Content -Raw $draftBody -ErrorAction SilentlyContinue
  Assert-True (($draftLoc -match "id=$leadId") -or ($draftHtml -match 'Smoke draft note|Contact details saved|Hospital record saved|Regression Contact')) 'Agent save draft accepted' "loc=$draftLoc"

  # Reload for fresh csrf/version
  $page = Fetch $agentJar "/index.php?id=$leadId" 'agent-lead2.html'
  $csrf = Get-Csrf $page.Html
  $version = if ($page.Html -match 'name="version" value="(\d+)"') { $Matches[1] } else { '1' }
  $phone = if ($page.Html -match 'name="phone"[^>]*value="([^"]*)"') { $Matches[1] } else { '+10000000000' }

  # Save call & stay
  $stayHdr = Join-Path $tmp 'stay.hdr'
  & curl.exe -s -c $agentJar -b $agentJar -X POST "$base/index.php?id=$leadId" `
    --data-urlencode "csrf=$csrf" `
    --data-urlencode "action=save_call_stay" `
    --data-urlencode "id=$leadId" `
    --data-urlencode "version=$version" `
    --data-urlencode "source_name=Regression Contact" `
    --data-urlencode "source_title=Director" `
    --data-urlencode "source_email=contact@example.com" `
    --data-urlencode "alternate_phone=" `
    --data-urlencode "status=No Answer" `
    --data-urlencode "current_software=" `
    --data-urlencode "requirements=" `
    --data-urlencode "notes=Smoke call attempt - no answer" `
    --data-urlencode "callback_at=" `
    --data-urlencode "demo_at=" `
    --data-urlencode "call_number=$phone" `
    -D $stayHdr -o NUL
  $stayLoc = (Select-String -Path $stayHdr -Pattern '^Location:\s*(.+)$' | Select-Object -First 1).Matches.Groups[1].Value.Trim()
  Assert-True ($stayLoc -match "id=$leadId") 'Save call & stay keeps same hospital' "loc=$stayLoc"

  # Take break
  $breakPage = Fetch $agentJar '/work.php' 'before-break.html'
  # break is posted to work.php from sidebar on index — use work.php mode=break
  $csrf = Get-Csrf (Fetch $agentJar "/index.php?id=$leadId" 'agent-for-break.html').Html
  if (-not $csrf) { $csrf = Get-Csrf (Get-Content -Raw (Join-Path $tmp 'agent-for-break.html') -ErrorAction SilentlyContinue) }
  # work.php has its own csrf via session — get from work form after break attempt using session
  $workHtml = (Fetch $agentJar '/work.php' 'work-csrf.html').Html
  # Actually when agent has active lead, work.php redirects to index. Break form is on index sidebar.
  $idx = Fetch $agentJar "/index.php?id=$leadId" 'agent-break-form.html'
  $csrf = Get-Csrf $idx.Html
  $breakHdr = Join-Path $tmp 'break.hdr'
  & curl.exe -s -c $agentJar -b $agentJar -X POST "$base/work.php" `
    --data-urlencode "csrf=$csrf" `
    --data-urlencode "mode=break" `
    --data-urlencode "reason=Tea / coffee" `
    -D $breakHdr -o (Join-Path $tmp 'break.html') -L
  $breakHtml = Get-Content -Raw (Join-Path $tmp 'break.html')
  Assert-True ($breakHtml -match 'break|Tea / coffee|Resume') 'Agent can take a break' 

  # Resume
  $csrf = Get-Csrf $breakHtml
  if (-not $csrf) { $csrf = Get-Csrf (Fetch $agentJar '/work.php' 'resume-page.html').Html }
  $resumeHdr = Join-Path $tmp 'resume.hdr'
  & curl.exe -s -c $agentJar -b $agentJar -X POST "$base/work.php" `
    --data-urlencode "csrf=$csrf" `
    --data-urlencode "mode=ready" `
    -D $resumeHdr -o NUL -L
  $afterBreak = Fetch $agentJar "/index.php?id=$leadId" 'agent-after-resume.html'
  Assert-True ($afterBreak.Html -match "RECORD #$leadId|id=$leadId|Save call") 'Resume returns to same hospital'

  # Dispose & next
  $page = Fetch $agentJar "/index.php?id=$leadId" 'agent-dispose.html'
  $csrf = Get-Csrf $page.Html
  $version = if ($page.Html -match 'name="version" value="(\d+)"') { $Matches[1] } else { '2' }
  $phone = if ($page.Html -match 'name="phone"[^>]*value="([^"]*)"') { $Matches[1] } else { $phone }
  $dispHdr = Join-Path $tmp 'dispose.hdr'
  & curl.exe -s -c $agentJar -b $agentJar -X POST "$base/index.php?id=$leadId" `
    --data-urlencode "csrf=$csrf" `
    --data-urlencode "action=save" `
    --data-urlencode "id=$leadId" `
    --data-urlencode "version=$version" `
    --data-urlencode "source_name=Regression Contact" `
    --data-urlencode "source_title=Director" `
    --data-urlencode "source_email=contact@example.com" `
    --data-urlencode "alternate_phone=" `
    --data-urlencode "status=Interested" `
    --data-urlencode "current_software=" `
    --data-urlencode "requirements=Need demo next week" `
    --data-urlencode "notes=Smoke dispose - interested" `
    --data-urlencode "callback_at=" `
    --data-urlencode "demo_at=" `
    --data-urlencode "call_number=$phone" `
    -D $dispHdr -o NUL
  $dispLoc = (Select-String -Path $dispHdr -Pattern '^Location:\s*(.+)$' | Select-Object -First 1).Matches.Groups[1].Value.Trim()
  Assert-True ($dispLoc -match 'work\.php|index\.php') 'Dispose redirects to next queue step' "loc=$dispLoc"
} else {
  Assert-True $false 'Agent claimed a hospital' 'No lead id after work.php'
}

# Agent forbidden from admin reports
$agentReports = & curl.exe -s -c $agentJar -b $agentJar -o (Join-Path $tmp 'agent-reports.html') -w "%{http_code}" "$base/reports.php"
$agentReportsHtml = Get-Content -Raw (Join-Path $tmp 'agent-reports.html')
Assert-True ($agentReports -eq '403' -or $agentReportsHtml -match 'Admin access required') 'Agent blocked from reports' "code=$agentReports"

# Admin reports reflect activity
$reports2 = Fetch $adminJar '/reports.php' 'admin-reports2.html'
Assert-True ($reports2.Html -match 'Call attempts|Organisation totals') 'Admin reports still load after agent activity'
if ($leadId) {
  Assert-True ($reports2.Html -match '>[1-9][0-9]*<') 'Admin reports show non-zero activity after smoke calls'
}

# Logout
$logoutHdr = Join-Path $tmp 'logout.hdr'
$csrf = Get-Csrf (Fetch $adminJar '/index.php' 'admin-logout-csrf.html').Html
& curl.exe -s -c $adminJar -b $adminJar -X POST "$base/logout.php" --data-urlencode "csrf=$csrf" -D $logoutHdr -o NUL
Assert-True $true 'Admin logout posted'

Write-Host ""
Write-Host "=== Results: $pass passed, $fail failed ==="
if ($notes.Count -gt 0) {
  Write-Host "Failures:"
  $notes | ForEach-Object { Write-Host " - $_" }
}
$summary = @()
$summary += "Talkvia CRM smoke/regression"
$summary += "Passed: $pass"
$summary += "Failed: $fail"
$summary += ($notes -join "`n")
$summary | Set-Content (Join-Path $tmp 'SUMMARY.txt')
exit $(if ($fail -gt 0) { 1 } else { 0 })
