<#
.SYNOPSIS
    Start AI Sales Agent — Internal Test Stack (No SIP Provider Needed).

.DESCRIPTION
    Verifies and starts all components needed for the internal MicroSIP test:
    1. Docker + FreeSWITCH container
    2. Ollama (local LLM)
    3. Redis (caching)
    4. ESL connectivity
    5. Backend (FastAPI)
    6. Injects configs and reloads FreeSWITCH

    Prints PASS/FAIL for each dependency.

.PARAMETER NoBackend
    Skip starting the backend (useful if already running).

.PARAMETER NoConfigInject
    Skip config injection into FreeSWITCH Docker container.

.EXAMPLE
    .\scripts\start_internal_test.ps1
    Full stack startup with all checks.

.EXAMPLE
    .\scripts\start_internal_test.ps1 -NoBackend
    Start everything except the backend.

.NOTES
    Author: AI Sales Agent
    Date:   June 6, 2026
#>

param(
    [switch]$NoBackend,
    [switch]$NoConfigInject
)

$host.UI.RawUI.WindowTitle = "AI Sales Agent — Internal Test Stack"

$GREEN = "Green"
$RED = "Red"
$YELLOW = "Yellow"
$CYAN = "Cyan"
$WHITE = "White"

function Write-PASS { Write-Host "  ✅ PASS: $($args[0])" -ForegroundColor $GREEN }
function Write-FAIL { Write-Host "  ❌ FAIL: $($args[0])" -ForegroundColor $RED }
function Write-WARN { Write-Host "  ⚠️  WARN: $($args[0])" -ForegroundColor $YELLOW }
function Write-INFO { Write-Host "  ℹ️  $($args[0])" -ForegroundColor $WHITE }
function Write-STEP { Write-Host "`n━━━ $($args[0]) ━━━" -ForegroundColor $CYAN }

# ── Header ──
Write-Host @"

╔════════════════════════════════════════════════════╗
║   AI Sales Agent — Internal Test Stack              ║
║   MicroSIP → FreeSWITCH → AI Agent → MicroSIP       ║
╚════════════════════════════════════════════════════╝

"@ -ForegroundColor $CYAN

# ── Dependencies ──
$PASS_COUNT = 0
$FAIL_COUNT = 0
$WARN_COUNT = 0

# ── Step 1: Docker ──
Write-STEP "Step 1/6: Docker"
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-PASS "Docker: $dockerVersion"
        $PASS_COUNT++
    } else {
        Write-FAIL "Docker is not installed or not in PATH"
        $FAIL_COUNT++
    }
} catch {
    Write-FAIL "Docker check failed: $_"
    $FAIL_COUNT++
}

# ── Step 2: Docker Stack ──
Write-STEP "Step 2/6: Docker Stack (FreeSWITCH + Redis)"
$composeFile = Join-Path $PSScriptRoot ".." "docker" "freeswitch-docker-compose.yml"
if (-not (Test-Path $composeFile)) {
    Write-FAIL "Compose file not found: $composeFile"
    $FAIL_COUNT++
} else {
    # Check if containers are running
    $freeswitchRunning = $false
    $redisRunning = $false
    try {
        $containers = docker ps --format "{{.Names}}" 2>&1
        if ($containers -contains "ai-freeswitch") {
            Write-PASS "FreeSWITCH container (ai-freeswitch) is running"
            $freeswitchRunning = $true
            $PASS_COUNT++
        } else {
            Write-WARN "FreeSWITCH container not running. Starting stack..."
            $WARN_COUNT++
            # Start the stack
            $startResult = docker compose -f $composeFile up -d freeswitch redis 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-PASS "Stack started: freeswitch + redis"
                $freeswitchRunning = $true
                $PASS_COUNT++
                Start-Sleep -Seconds 5  # Wait for FreeSWITCH to initialize
            } else {
                Write-FAIL "Failed to start Docker stack: $startResult"
                $FAIL_COUNT++
            }
        }

        if ($containers -contains "ai-fs-redis") {
            Write-PASS "Redis container (ai-fs-redis) is running"
            $redisRunning = $true
            $PASS_COUNT++
        } elseif ($freeswitchRunning) {
            # Redis might already be up
            $redisCheck = docker ps --filter "name=ai-fs-redis" --format "{{.Names}}" 2>&1
            if ($redisCheck) {
                Write-PASS "Redis container is running"
                $PASS_COUNT++
            } else {
                Write-WARN "Redis container not found"
                $WARN_COUNT++
            }
        }
    } catch {
        Write-FAIL "Docker stack check failed: $_"
        $FAIL_COUNT++
    }

    # Wait for FreeSWITCH health
    if ($freeswitchRunning) {
        Write-INFO "Waiting for FreeSWITCH to become healthy..."
        $healthCheck = $null
        for ($i = 0; $i -lt 30; $i++) {
            try {
                $healthCheck = docker exec ai-freeswitch fs_cli -x "status" 2>&1
                if ($healthCheck -match "UP" -or $healthCheck -match "up") {
                    Write-PASS "FreeSWITCH is healthy"
                    $PASS_COUNT++
                    break
                }
            } catch {
                # Still starting
            }
            Start-Sleep -Seconds 1
        }
        if (-not ($healthCheck -match "UP")) {
            Write-WARN "FreeSWITCH health check timed out (continuing)"
            $WARN_COUNT++
        }
    }
}

# ── Step 3: Config Injection ──
Write-STEP "Step 3/6: FreeSWITCH Configuration"
if ($NoConfigInject) {
    Write-WARN "Config injection skipped (NoConfigInject flag)"
    $WARN_COUNT++
} elseif (-not $freeswitchRunning) {
    Write-WARN "Cannot inject configs — FreeSWITCH not running"
    $WARN_COUNT++
} else {
    $setupScript = Join-Path $PSScriptRoot "setup_internal_fs.ps1"
    if (Test-Path $setupScript) {
        & $setupScript
        if ($LASTEXITCODE -eq 0) {
            Write-PASS "Config injection complete"
            $PASS_COUNT++
        } else {
            Write-FAIL "Config injection failed"
            $FAIL_COUNT++
        }
    } else {
        Write-FAIL "Setup script not found: $setupScript"
        $FAIL_COUNT++
    }
}

# ── Step 4: Ollama ──
Write-STEP "Step 4/6: Ollama (Local LLM)"
try {
    $ollamaResp = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($ollamaResp.StatusCode -eq 200) {
        Write-PASS "Ollama is running at http://localhost:11434"
        $PASS_COUNT++

        # Check model
        $models = $ollamaResp.Content | ConvertFrom-Json
        $modelName = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen2.5:1.5b" }
        $modelFound = $models.models | Where-Object { $_.name -eq $modelName -or $_.name -like "$modelName*" }
        if ($modelFound) {
            Write-PASS "Model '$modelName' is available"
            $PASS_COUNT++
        } else {
            Write-WARN "Model '$modelName' not found. Pulling now..."
            $WARN_COUNT++
            try {
                $pullResult = Start-Process -NoNewWindow -Wait -FilePath "ollama" -ArgumentList "pull", $modelName
                if ($LASTEXITCODE -eq 0) {
                    Write-PASS "Model '$modelName' pulled successfully"
                    $PASS_COUNT++
                } else {
                    Write-WARN "Model pull may have failed (non-zero exit: $LASTEXITCODE)"
                    $WARN_COUNT++
                }
            } catch {
                Write-WARN "Could not pull model: $_"
                $WARN_COUNT++
            }
        }
    } else {
        Write-FAIL "Ollama returned status $($ollamaResp.StatusCode)"
        $FAIL_COUNT++
    }
} catch {
    Write-WARN "Ollama is not running. Start it with: ollama serve"
    $WARN_COUNT++
}

# ── Step 5: ESL Connectivity ──
Write-STEP "Step 5/6: ESL Connectivity"
if ($freeswitchRunning) {
    try {
        $eslTest = docker exec ai-freeswitch fs_cli -x "status" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-PASS "ESL port 8021 reachable (fs_cli works)"
            $PASS_COUNT++
        } else {
            Write-FAIL "ESL not reachable: $eslTest"
            $FAIL_COUNT++
        }

        # Also check SIP port
        $sipTest = docker exec ai-freeswitch fs_cli -x "sofia status" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-PASS "SIP port 5060 reachable (Sofia status OK)"
            $PASS_COUNT++
        } else {
            Write-FAIL "SIP check failed: $sipTest"
            $FAIL_COUNT++
        }
    } catch {
        Write-FAIL "ESL/SIP check error: $_"
        $FAIL_COUNT++
    }
} else {
    Write-FAIL "Cannot test ESL — FreeSWITCH not running"
    $FAIL_COUNT++
}

# ── Step 6: Backend ──
Write-STEP "Step 6/6: Backend (FastAPI on port 8000)"
if ($NoBackend) {
    Write-WARN "Backend start skipped (NoBackend flag)"
    $WARN_COUNT++
} else {
    # Check if backend is already running
    try {
        $backendResp = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($backendResp.StatusCode -eq 200) {
            $backendData = $backendResp.Content | ConvertFrom-Json
            Write-PASS "Backend is running (status: $($backendData.status))"
            $PASS_COUNT++
        } else {
            Write-WARN "Backend returned status $($backendResp.StatusCode)"
            $WARN_COUNT++
        }
    } catch {
        Write-INFO "Backend not running. Attempting to start..."
        $backendDir = Resolve-Path (Join-Path $PSScriptRoot ".." "backend")
        try {
            # Try starting uvicorn in background
            $logFile = Join-Path $PSScriptRoot ".." "backend_internal_test.log"
            $startInfo = New-Object System.Diagnostics.ProcessStartInfo
            $startInfo.FileName = "uvicorn"
            $startInfo.Arguments = "app.main:app --host 0.0.0.0 --port 8000 --log-level info"
            $startInfo.WorkingDirectory = $backendDir
            $startInfo.RedirectStandardOutput = $true
            $startInfo.RedirectStandardError = $true
            $startInfo.UseShellExecute = $false
            $startInfo.CreateNoWindow = $true
            $process = New-Object System.Diagnostics.Process
            $process.StartInfo = $startInfo
            $process.Start() | Out-Null

            Start-Sleep -Seconds 3

            # Verify it started
            try {
                $verifyResp = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 3
                if ($verifyResp.StatusCode -eq 200) {
                    Write-PASS "Backend started successfully on port 8000"
                    $PASS_COUNT++
                    Write-INFO "Logs: $logFile"
                }
            } catch {
                Write-FAIL "Backend failed to start. Check the log: $logFile"
                $FAIL_COUNT++
            }
        } catch {
            Write-FAIL "Could not start backend: $_"
            Write-INFO "Start it manually: cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"
            $FAIL_COUNT++
        }
    }
}

# ── Summary ──
Write-Host @"

╔════════════════════════════════════════════════════╗
║                    RESULTS                          ║
╚════════════════════════════════════════════════════╝
"@ -ForegroundColor $CYAN

Write-Host "  ✅ PASS: $PASS_COUNT" -ForegroundColor $GREEN
Write-Host "  ❌ FAIL: $FAIL_COUNT" -ForegroundColor $RED
Write-Host "  ⚠️  WARN: $WARN_COUNT" -ForegroundColor $YELLOW
Write-Host ""

if ($FAIL_COUNT -eq 0) {
    Write-Host "  🎉 All checks passed! The internal test setup is ready." -ForegroundColor $GREEN
    Write-Host ""
    Write-Host "  ── MicroSIP Configuration ──" -ForegroundColor $CYAN
    Write-Host "  Server:    127.0.0.1" -ForegroundColor $WHITE
    Write-Host "  Port:      5060" -ForegroundColor $WHITE
    Write-Host "  Transport: UDP" -ForegroundColor $WHITE
    Write-Host "  Username:  1000" -ForegroundColor $WHITE
    Write-Host "  Password:  1000pass" -ForegroundColor $WHITE
    Write-Host "  Domain:    127.0.0.1" -ForegroundColor $WHITE
    Write-Host ""
    Write-Host "  ── Test Call ──" -ForegroundColor $CYAN
    Write-Host "  Dial 1001 → AI Agent (STT → LLM → TTS)" -ForegroundColor $WHITE
    Write-Host ""
    Write-Host "  ── Monitor ──" -ForegroundColor $CYAN
    Write-Host "  docker logs ai-freeswitch --tail 50 -f" -ForegroundColor $YELLOW
    Write-Host "  http://localhost:8000/health" -ForegroundColor $YELLOW
    Write-Host "  http://localhost:8000/fs/health" -ForegroundColor $YELLOW
    Write-Host ""
    Write-Host "  See docs/microsip_internal_test.md for detailed instructions." -ForegroundColor $WHITE
} else {
    Write-Host "  ⚠️  Some checks failed. See details above for troubleshooting." -ForegroundColor $YELLOW
    Write-Host "  Fix the failures and re-run this script." -ForegroundColor $YELLOW
}

exit $FAIL_COUNT
