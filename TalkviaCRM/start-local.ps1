$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path (Split-Path -Parent $root) 'KluCRM\_tools'
$php = Join-Path $tools 'php\php.exe'
$mdb = Join-Path $tools 'mariadb\mariadb-11.4.5-winx64'
$data = Join-Path $tools 'mariadb-data'
$crm = Join-Path $root 'crm'

if (-not (Test-Path $php)) { throw "Portable PHP missing at $php" }
if (-not (Test-Path (Join-Path $mdb 'bin\mysqld.exe'))) { throw "Portable MariaDB missing at $mdb" }

$listening = netstat -ano | Select-String ':3307\s+.*LISTENING'
if (-not $listening) {
  Write-Host 'Starting MariaDB on 127.0.0.1:3307 ...'
  Start-Process -FilePath (Join-Path $mdb 'bin\mysqld.exe') -ArgumentList @(
    "--datadir=$data",
    '--port=3307',
    '--bind-address=127.0.0.1',
    '--console'
  ) -WindowStyle Hidden
  Start-Sleep -Seconds 4
}

& $php (Join-Path $crm 'local-seed.php')

Write-Host ''
Write-Host 'Talkvia CRM:  http://127.0.0.1:8080/login.php'
Write-Host 'Admin:        admin@talkvia.local / TalkviaAdmin1!'
Write-Host 'Agent:        agent@talkvia.local / TalkviaAgent1!'
Write-Host 'KluCRM stays: http://localhost:3010'
Write-Host ''

Set-Location $crm
& $php -S 127.0.0.1:8080
