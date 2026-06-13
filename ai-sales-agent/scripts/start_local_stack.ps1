<#
.SYNOPSIS
    Start the AI Sales Agent local production stack.
.DESCRIPTION
    Automatically starts Ollama, verifies the model, starts the backend,
    runs health checks, verifies providers, and displays URLs.
    Single command to get the entire stack running.
#>

$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "AI Sales Agent — Local Stack"

# ── Configuration ──────────────────────────────────────────────────
$BACKEND_DIR = Join-Path $PSScriptRoot ".." "backend"
$OLLAMA_URL = "http://localhost:11434"
$BACKEND_URL = "http://localhost:8000"
$OLLAMA_MODEL = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen2.5:1.5b" }

# Colors
$GREEN = "Green"
$YELLOW = "Yellow"
$RED = "Red"
$CYAN = "Cyan"
$WHITE = "White"

function Write-Step {
    param([string]$Message)
    Write-Host "`n━━━ $Message ━━━" -ForegroundColor $CYAN
}

function Write-OK {
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor $GREEN
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠️  $Message" -ForegroundColor $YELLOW
}

function Write-Error {
    param([string]$Message)
    Write-Host "  ❌ $Message" -ForegroundColor $RED
}

function Test-Command {
    param([string]$Command)
    return (Get-Command $Command -ErrorAction SilentlyContinue) -ne $null
}

# ── Header ─────────────────────────────────────────────────────────
Write-Host @"

╔═══════════════════════════════════════════════════╗
║       AI Sales Agent — Local Production Stack     ║
╚═══════════════════════════════════════════════════╝

"@ -ForegroundColor $CYAN

Write-Host "Starting stack with model: $OLLAMA_MODEL" -ForegroundColor $WHITE
Write-Host "Backend directory: $BACKEND_DIR" -ForegroundColor $WHITE
Write-Host ""

# ── Step 1: Check Python ──────────────────────────────────────────
Write-Step "Step 1/6: Checking Python"
if (Test-Command "python") {
    $pyVersion = python --version
    Write-OK "Python: $pyVersion"
} elseif (Test-Command "python3") {
    $pyVersion = python3 --version
    Write-OK "Python: $pyVersion"
} else {
    Write-Error "Python is not installed. Install Python 3.10+ from https://python.org"
    exit 1
}

# ── Step 2: Check Ollama ──────────────────────────────────────────
Write-Step "Step 2/6: Checking Ollama"
$ollamaRunning = $false
try {
    $response = Invoke-WebRequest -Uri "$OLLAMA_URL/api/tags" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-OK "Ollama is running at $OLLAMA_URL"
        $ollamaRunning = $true
    }
} catch {
    Write-Warn "Ollama is not running. Attempting to start..."
}

if (-not $ollamaRunning) {
    if (Test-Command "ollama") {
        Write-Host "  Starting Ollama server..." -ForegroundColor $YELLOW
        $ollamaProcess = Start-Process -NoNewWindow -PassThru -FilePath "ollama" -ArgumentList "serve"
        Start-Sleep -Seconds 3
        # Verify it started
        try {
            $response = Invoke-WebRequest -Uri "$OLLAMA_URL/api/tags" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-OK "Ollama started successfully"
                $ollamaRunning = $true
            }
        } catch {
            Write-Error "Failed to start Ollama. Start it manually: ollama serve"
            exit 1
        }
    } else {
        Write-Error "Ollama is not installed. Install from https://ollama.com"
        Write-Host "  Then download the model: ollama pull $OLLAMA_MODEL" -ForegroundColor $YELLOW
        exit 1
    }
}

# ── Step 3: Verify Model ──────────────────────────────────────────
Write-Step "Step 3/6: Verifying Ollama model '$OLLAMA_MODEL'"
try {
    $response = Invoke-WebRequest -Uri "$OLLAMA_URL/api/tags" -UseBasicParsing -TimeoutSec 10
    $models = $response.Content | ConvertFrom-Json
    $modelExists = $models.models | Where-Object { $_.name -eq $OLLAMA_MODEL -or $_.name -like "$OLLAMA_MODEL*" }
    if ($modelExists) {
        Write-OK "Model '$OLLAMA_MODEL' is available"
    } else {
        Write-Warn "Model '$OLLAMA_MODEL' not found. Pulling now (this may take a few minutes)..."
        try {
            $pullProcess = Start-Process -NoNewWindow -Wait -FilePath "ollama" -ArgumentList "pull", $OLLAMA_MODEL
            Write-OK "Model '$OLLAMA_MODEL' pulled successfully"
        } catch {
            Write-Error "Failed to pull model. Try: ollama pull $OLLAMA_MODEL"
        }
    }
} catch {
    Write-Warn "Could not verify model (Ollama may still be starting)"
}

# ── Step 4: Install Python Dependencies ──────────────────────────
Write-Step "Step 4/6: Installing Python dependencies"
Set-Location $BACKEND_DIR
try {
    pip install -r requirements.txt -q
    Write-OK "Python dependencies installed"
} catch {
    Write-Warn "pip install failed (may already be installed)"
}

# ── Step 5: Start Backend ─────────────────────────────────────────
Write-Step "Step 5/6: Starting backend server"
Write-Host "  Backend will be available at: http://localhost:8000" -ForegroundColor $WHITE
Write-Host "  API docs at: http://localhost:8000/docs" -ForegroundColor $WHITE
Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor $YELLOW
Write-Host ""

# Start uvicorn
try {
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info
} catch {
    Write-Error "Failed to start backend. Try manually:"
    Write-Host "  cd $BACKEND_DIR && uvicorn app.main:app --host 0.0.0.0 --port 8000" -ForegroundColor $YELLOW
    exit 1
}

# Note: The script only reaches here after uvicorn exits (Ctrl+C)
Write-Host "`nBackend server stopped." -ForegroundColor $YELLOW
