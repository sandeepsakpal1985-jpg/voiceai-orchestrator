# Verify that a PostgreSQL dump can be restored.
# Usage (from KluCoach): pwsh -File scripts/verify-backup.ps1

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = $env:PGPASSWORD
if (-not $env:PGPASSWORD) { $env:PGPASSWORD = "klucoach" }
$hostName = if ($env:PGHOST) { $env:PGHOST } else { "localhost" }
$port = if ($env:PGPORT) { $env:PGPORT } else { "55433" }
$user = if ($env:PGUSER) { $env:PGUSER } else { "klucoach" }
$sourceDb = if ($env:PGDATABASE) { $env:PGDATABASE } else { "klucoach" }
$restoreDb = "klucoach_restore_check"
$dump = Join-Path $env:TEMP "klucoach-backup-verify.dump"

Write-Host "Dumping $sourceDb from ${hostName}:${port}"
& pg_dump -h $hostName -p $port -U $user -Fc -f $dump $sourceDb
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

Write-Host "Recreating $restoreDb"
& psql -h $hostName -p $port -U $user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$restoreDb';" | Out-Null
& dropdb -h $hostName -p $port -U $user --if-exists $restoreDb
& createdb -h $hostName -p $port -U $user $restoreDb
& pg_restore -h $hostName -p $port -U $user --no-owner -d $restoreDb $dump
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }

function Query-Count($table) {
  & psql -h $hostName -p $port -U $user -d $restoreDb -tAc "SELECT count(*) FROM $table;"
}

$count = Query-Count "institutions"
$students = Query-Count "students"
$guardians = Query-Count "guardians"
$attendance = Query-Count "attendance_records"
$assessments = Query-Count "assessments"
$assignments = Query-Count "assignments"
$notifications = Query-Count "notifications"
$billing = Query-Count "billing_invoices"
$movement = Query-Count "movement_events"
Write-Host "Restored institution count: $count"
Write-Host "Restored students: $students"
Write-Host "Restored guardians/parents: $guardians"
Write-Host "Restored attendance records: $attendance"
Write-Host "Restored assessments: $assessments"
Write-Host "Restored assignments: $assignments"
Write-Host "Restored notifications: $notifications"
Write-Host "Restored billing invoices: $billing"
Write-Host "Restored movement events: $movement"
if (-not $count) { throw "restore verification query failed" }

& dropdb -h $hostName -p $port -U $user $restoreDb
Remove-Item $dump -ErrorAction SilentlyContinue
Write-Host "RESTORE_VERIFIED"
