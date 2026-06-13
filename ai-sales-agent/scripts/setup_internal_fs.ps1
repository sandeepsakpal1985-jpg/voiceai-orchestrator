<#
.SYNOPSIS
    Setup FreeSWITCH config for internal extension testing.

.DESCRIPTION
    Injects custom FreeSWITCH config files (dialplan, directory, SIP profile)
    into the running ai-freeswitch Docker container, then reloads
    FreeSWITCH configuration so extensions 1000 and 1001 are available.

    Run this AFTER the Docker stack is up (docker compose -f docker/freeswitch-docker-compose.yml up -d).

.PARAMETER ContainerName
    Name of the FreeSWITCH Docker container (default: ai-freeswitch).

.PARAMETER ConfigSource
    Local path to the FreeSWITCH config files (default: telephony/configs/freeswitch).

.EXAMPLE
    .\scripts\setup_internal_fs.ps1
    Injects configs into the ai-freeswitch container and reloads FS.

.NOTES
    Author: AI Sales Agent
    Date:   June 6, 2026
#>

param(
    [string]$ContainerName = "ai-freeswitch",
    [string]$ConfigSource = (Join-Path (Join-Path (Join-Path (Join-Path $PSScriptRoot "..") "telephony") "configs") "freeswitch")
)

$GREEN = "Green"
$RED = "Red"
$YELLOW = "Yellow"
$CYAN = "Cyan"
$WHITE = "White"

function Write-OK  { Write-Host "[OK] $($args[0])" -ForegroundColor $GREEN }
function Write-Err { Write-Host "[ERR] $($args[0])" -ForegroundColor $RED }
function Write-Warn{ Write-Host "[WARN] $($args[0])" -ForegroundColor $YELLOW }
function Write-Step{ Write-Host "`n--- $($args[0]) ---" -ForegroundColor $CYAN }

Write-Host "FreeSWITCH Internal Test - Config Injector" -ForegroundColor $CYAN

# ── Step 1: Verify container is running ──
Write-Step "Step 1/5: Verifying FreeSWITCH container"
$containerCheck = docker ps --filter "name=$ContainerName" --format "{{.Names}}" 2>&1
if ($LASTEXITCODE -ne 0 -or -not $containerCheck) {
    Write-Err "Container '$ContainerName' is not running."
    Write-Host "  Start the stack first:" -ForegroundColor $YELLOW
    Write-Host "    docker compose -f docker/freeswitch-docker-compose.yml up -d" -ForegroundColor $CYAN
    exit 1
}
Write-OK "Container '$ContainerName' is running"

# ── Step 2: Verify config source exists ──
Write-Step "Step 2/5: Checking config files"
$ConfigSource = Resolve-Path $ConfigSource -ErrorAction SilentlyContinue
if (-not $ConfigSource) {
    Write-Err "Config source not found: $ConfigSource"
    exit 1
}
Write-OK "Config source: $ConfigSource"

# List key files
$requiredFiles = @(
    "dialplan/default.xml",
    "sip_profiles/internal.xml",
    "directory/default/1000.xml",
    "directory/default/1001.xml",
    "event_socket.conf.xml",
    "vars.xml"
)
$allFound = $true
foreach ($file in $requiredFiles) {
    $path = Join-Path $ConfigSource $file
    if (Test-Path $path) {
        Write-OK "  Found: $file"
    } else {
        Write-Warn "  Missing: $file (optional)"
    }
}

# ── Step 3: Copy configs into container ──
Write-Step "Step 3/5: Copying configs into container"

# Copy dialplan
Write-Host "  Copying dialplan..." -ForegroundColor $WHITE
docker exec $ContainerName mkdir -p /etc/freeswitch/dialplan 2>&1 | Out-Null
$dialplanDest = "/etc/freeswitch/dialplan/default.xml"
$dialplanSrc = Join-Path (Join-Path $ConfigSource "dialplan") "default.xml"
if (Test-Path $dialplanSrc) {
    docker cp $dialplanSrc "${ContainerName}:${dialplanDest}" 2>&1
    if ($LASTEXITCODE -eq 0) { Write-OK "  Copied dialplan/default.xml" }
    else { Write-Err "  Failed to copy dialplan/default.xml" }
}

# Copy directory entries
Write-Host "  Copying directory entries..." -ForegroundColor $WHITE
docker exec $ContainerName mkdir -p /etc/freeswitch/directory/default 2>&1 | Out-Null
$dirSrc = Join-Path (Join-Path $ConfigSource "directory") "default"
if (Test-Path $dirSrc) {
    Get-ChildItem $dirSrc -Filter "*.xml" | ForEach-Object {
        docker cp $_.FullName "${ContainerName}:/etc/freeswitch/directory/default/$($_.Name)" 2>&1
        if ($LASTEXITCODE -eq 0) { Write-OK "  Copied directory/default/$($_.Name)" }
        else { Write-Err "  Failed to copy directory/default/$($_.Name)" }
    }
}

# Copy SIP profiles
Write-Host "  Copying SIP profiles..." -ForegroundColor $WHITE
docker exec $ContainerName mkdir -p /etc/freeswitch/sip_profiles 2>&1 | Out-Null
$sipSrc = Join-Path $ConfigSource "sip_profiles"
if (Test-Path $sipSrc) {
    Get-ChildItem $sipSrc -Filter "*.xml" | ForEach-Object {
        docker cp $_.FullName "${ContainerName}:/etc/freeswitch/sip_profiles/$($_.Name)" 2>&1
        if ($LASTEXITCODE -eq 0) { Write-OK "  Copied sip_profiles/$($_.Name)" }
        else { Write-Err "  Failed to copy sip_profiles/$($_.Name)" }
    }
}

# Copy other config files
$extraConfigs = @{
    "event_socket.conf.xml" = "/etc/freeswitch/autoload_configs/event_socket.conf.xml"
    "vars.xml" = "/etc/freeswitch/vars.xml"
}
foreach ($entry in $extraConfigs.GetEnumerator()) {
    $srcFile = $entry.Key
    $destPath = $entry.Value
    $srcPath = Join-Path $ConfigSource $srcFile
    if (Test-Path $srcPath) {
        docker cp $srcPath "${ContainerName}:${destPath}" 2>&1
        if ($LASTEXITCODE -eq 0) { Write-OK "  Copied $srcFile" }
        else { Write-Err "  Failed to copy $srcFile" }
    }
}

# Copy ai_bridge.conf if available
$aiBridgeSrc = Join-Path $ConfigSource "ai_bridge.xml"
$aiBridgeDest = "/etc/freeswitch/autoload_configs/ai_bridge.xml"
if (Test-Path $aiBridgeSrc) {
    docker exec $ContainerName mkdir -p /etc/freeswitch/autoload_configs 2>&1 | Out-Null
    docker cp $aiBridgeSrc "${ContainerName}:${aiBridgeDest}" 2>&1
    if ($LASTEXITCODE -eq 0) { Write-OK "  Copied ai_bridge.xml" }
    else { Write-Err "  Failed to copy ai_bridge.xml" }
}

# ── Step 4: Reload FreeSWITCH configuration ──
Write-Step "Step 4/5: Reloading FreeSWITCH configuration"
$reloadSteps = @(
    "reloadxml",
    "reloadacl",
    "reload mod_sofia",
    "sofia profile internal restart"
)
foreach ($step in $reloadSteps) {
    $result = docker exec $ContainerName fs_cli -x "$step" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "  $step — OK"
    } else {
        Write-Warn "  $step — $result"
    }
}

# -- Step 5: Verify configuration --
Write-Step "Step 5/5: Verifying configuration"
Write-Host "  Checking registered users..." -ForegroundColor $WHITE
$registrations = docker exec $ContainerName fs_cli -x "show registrations" 2>&1
Write-Host $registrations -ForegroundColor $WHITE

Write-Host "  Checking ESL status..." -ForegroundColor $WHITE
$eslStatus = docker exec $ContainerName fs_cli -x "status" 2>&1
Write-Host $eslStatus -ForegroundColor $WHITE

# -- Summary --
Write-Host "===============================" -ForegroundColor $CYAN
Write-Host "Setup Complete!" -ForegroundColor $GREEN
Write-Host "===============================" -ForegroundColor $CYAN
Write-Host "Next steps:" -ForegroundColor $WHITE
Write-Host "  1. Open MicroSIP and register extension 1000" -ForegroundColor $CYAN
Write-Host "     Server:    127.0.0.1" -ForegroundColor $WHITE
Write-Host "     Username:  1000" -ForegroundColor $WHITE
Write-Host "     Password:  1000pass" -ForegroundColor $WHITE
Write-Host "  2. Dial 1001, 1002, 1003, or 1004 to reach an AI Agent" -ForegroundColor $CYAN
Write-Host "  3. Start the backend: .\scripts\start_internal_test.ps1" -ForegroundColor $CYAN
Write-Host "  4. See logs: docker logs ai-freeswitch --tail 50 -f" -ForegroundColor $YELLOW
Write-Host "" -ForegroundColor $WHITE
