# ── AI Voice Chat Demo — Startup Script ───────────────────────────
# Starts the backend server and opens the voice chat web page.
# Run this from the project root: ./scripts/start_voice_demo.ps1

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"

Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        🎙️  AI Voice Chat Demo - Starting...           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Change to backend directory
Set-Location $BackendDir

Write-Host "📡 Starting backend server on http://localhost:8000 ..." -ForegroundColor Yellow
Write-Host "⏳ This may take 30-60s while ML models (Whisper, LLM, TTS) load..." -ForegroundColor DarkYellow
Write-Host ""

# Start uvicorn in background
$process = Start-Process -FilePath "python" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" -NoNewWindow -PassThru

Write-Host "⏳ Waiting for server to start..." -ForegroundColor Yellow

# Wait for the server to become available
$maxWait = 120
$waitCount = 0
$serverReady = $false

while ($waitCount -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waitCount += 2
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -Method GET -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $serverReady = $true
            break
        }
    } catch {
        # Server not ready yet
    }
    if ($waitCount % 10 -eq 0) {
        Write-Host "  Still waiting... ($waitCount seconds)" -ForegroundColor DarkYellow
    }
}

if ($serverReady) {
    Write-Host ""
    Write-Host "✅ Server is running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║      🎙️  Open this link to talk to the AI:             ║" -ForegroundColor Green
    Write-Host "║                                                          ║" -ForegroundColor Cyan
    Write-Host "║   http://localhost:8000/frontend/voice-chat.html         ║" -ForegroundColor White
    Write-Host "║                                                          ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "📌 Tips:" -ForegroundColor Cyan
    Write-Host "  • Click the 🎤 mic button to start talking (auto-stops on silence)" -ForegroundColor White
    Write-Host "  • Hold Space to talk, release to stop" -ForegroundColor White
    Write-Host "  • Type messages and press Enter for text chat" -ForegroundColor White
    Write-Host "  • The AI responds with voice + text" -ForegroundColor White
    Write-Host "  • Use ?ws=wss://your-server.com to use a remote backend" -ForegroundColor White
    Write-Host ""
    Write-Host "   Chrome Extension: Load extension/ folder in chrome://extensions" -ForegroundColor DarkYellow
    Write-Host ""

    # Open the browser
    Start-Process "http://localhost:8000/frontend/voice-chat.html"
} else {
    Write-Host ""
    Write-Host "❌ Server failed to start within $maxWait seconds." -ForegroundColor Red
    Write-Host "   Check the backend terminal for errors." -ForegroundColor Red
    Write-Host "   Try running manually: cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000" -ForegroundColor DarkYellow
}

# Keep the script running until user presses a key
Write-Host "Press any key to stop the server..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
Write-Host "Stopping server..." -ForegroundColor Yellow
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
Set-Location $ProjectRoot
Write-Host "Server stopped." -ForegroundColor Gray
