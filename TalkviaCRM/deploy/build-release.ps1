$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$crm = Join-Path $root 'crm'
$dist = Join-Path $root 'deploy\dist'
$stage = Join-Path $dist 'stage-crm'
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$zip = Join-Path $dist "klucare-crm-$stamp.zip"

if (-not (Test-Path $crm)) { throw "CRM folder missing: $crm" }
New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# Copy application files; strip local secrets and dev helpers.
$excludeNames = @(
  'config.php',
  'mail-config.php',
  'setup.lock',
  'local-seed.php'
)
Get-ChildItem $crm -Force | ForEach-Object {
  if ($excludeNames -contains $_.Name) { return }
  Copy-Item $_.FullName -Destination (Join-Path $stage $_.Name) -Recurse -Force
}

# Ensure example mail config is present for operators.
Copy-Item (Join-Path $crm 'mail-config.example.php') (Join-Path $stage 'mail-config.example.php') -Force

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force

Write-Host "Release ready: $zip"
Write-Host 'Upload contents to the crm.klucare.com document root, then open /setup.php'
Get-Item $zip | Format-List FullName, Length, LastWriteTime
