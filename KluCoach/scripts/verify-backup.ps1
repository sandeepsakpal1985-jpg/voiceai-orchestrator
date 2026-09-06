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

$count = & psql -h $hostName -p $port -U $user -d $restoreDb -tAc "SELECT count(*) FROM institutions;"
$billing = & psql -h $hostName -p $port -U $user -d $restoreDb -tAc "SELECT count(*) FROM billing_invoices;"
$attendance = & psql -h $hostName -p $port -U $user -d $restoreDb -tAc "SELECT count(*) FROM attendance_records;"
$movement = & psql -h $hostName -p $port -U $user -d $restoreDb -tAc "SELECT count(*) FROM movement_events;"
Write-Host "Restored institution count: $count"
Write-Host "Restored billing invoices: $billing"
Write-Host "Restored attendance records: $attendance"
Write-Host "Restored movement events: $movement"
if (-not $count) { throw "restore verification query failed" }

& dropdb -h $hostName -p $port -U $user $restoreDb
Remove-Item $dump -ErrorAction SilentlyContinue
Write-Host "RESTORE_VERIFIED"
