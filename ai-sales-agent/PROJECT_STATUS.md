# PROJECT_STATUS.md — Voice Chat Recording Bug Fix

## Root Cause Analysis

### Bug 1 (Critical): `source.disconnect()` tears down the audio graph

**Location:** `frontend/voice-chat.html`, inside `startRecording()`

**Details:**
The code connected the microphone source to the ScriptProcessor recorder:
```javascript
source.connect(recorder);       // OK: audio flows source → recorder
```
Then later:
```javascript
source.disconnect();            // 🔴 BUG: Disconnects ALL outputs from source
source.connect(analyserNode);   // Reconnects source → analyser
analyserNode.connect(recorder); // Connects analyser → recorder
```

`source.disconnect()` removes the `source → recorder` connection. The reconnection through `analyserNode` (`source → analyser → recorder`) relies on AnalyserNode passing audio through to its output. While the spec says it should, some browser implementations have issues with AnalyserNode → ScriptProcessorNode chaining, especially since ScriptProcessorNode is deprecated in favor of AudioWorklet.

**Fix:** Connect source to BOTH recorder and analyser in parallel. AudioNodes support multiple output connections:
```javascript
source.connect(recorder);       // Audio flows to recorder for VAD/chunks
source.connect(analyserNode);   // Audio flows to analyser for visualizer
// No disconnect. No analyser→recorder chain.
```

### Bug 2 (Critical): VAD race condition — `stopRecording()` fires before `mediaRecorder` assigned

**Location:** `frontend/voice-chat.html`, `startRecording()` — timing between `source.connect(recorder)` and `mediaRecorder = {...}`

**Details:**
`onaudioprocess` fires as soon as `source.connect(recorder)` is called. The VAD logic inside the callback can accumulate 5 silent frames (~1.28s) and call `stopRecording()`. But `stopRecording()` guards with:
```javascript
if (!mediaRecorder || !state.isRecording) return;
```
Since `mediaRecorder` was still `null` (assigned much later), `stopRecording()` became a silent no-op. The user sees:
- Mic shows recording state
- But no audio is ever processed/sent
- After 5+ silent frames, `stopRecording()` is called again — this time `mediaRecorder` IS set, so it runs
- `state.isRecording` was set to `true` early, so the guard passes
- Audio is collected until VAD fires... but by this point, the user may have been waiting a long time

**Fix:** Assign `mediaRecorder` EARLY (as a placeholder object) BEFORE connecting any audio nodes. This way, if VAD fires, `stopRecording()` has a valid `mediaRecorder` to operate on.

### Bug 3 (Medium): Single monolithic try/catch

**Details:** The entire `startRecording()` was wrapped in one try/catch. Any failure at any step would log "Mic access denied", which is misleading if the actual error was an AudioContext creation failure or analyser setup failure.

**Fix:** Each major step has its own try/catch with precise error messages and proper partial cleanup (close AudioContext, stop tracks, etc.).

### Bug 4 (Low): Zero console logging

**Details:** There were no console.log statements in `startRecording()`, making it impossible to diagnose where the function was failing.

**Fix:** Added `console.log("STEP 1")` through `console.log("STEP 11")` at every major step, plus detailed logging for VAD state, audio duration, and WAV encoding.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/voice-chat.html` | Rewrote `startRecording()` with 11 STEP logs, individual try/catch per step, parallel audio graph connections, early `mediaRecorder` assignment |
| `frontend/voice-chat.html` | Rewrote `stopRecording()` with detailed logging and safer cleanup |
| `frontend/voice-chat.html` | Added debug banner (CSS + HTML + update function) showing WS status, mediaStream.active, isRecording, mediaRecorder. Toggle with double-click on header. |
| `PROJECT_STATUS.md` | This file |

---

## Test Instructions

### Prerequisites
1. Backend running at `http://localhost:8000`
2. Chrome browser (mic permission for localhost:8000 must be allowed)

### Test Steps

1. **Open the app:**
   ```
   http://localhost:8000/frontend/voice-chat.html
   ```

2. **Verify WebSocket connects:**
   - Green dot appears in header
   - Status says "Connected"
   - Chat shows "✅ Connected"

3. **Toggle debug banner (double-click header):**
   - See debug banner at bottom of screen
   - Verify: WS: Connected, micStream.active: null, isRecording: false, mediaRecorder: null

4. **Click mic button:**
   - ✅ Mic turns red and pulses
   - ✅ Status shows "🎤 Listening..."
   - ✅ Debug banner shows: isRecording: true
   - ✅ Console shows STEP 1 through STEP 11 all OK
   - ✅ Debug banner eventually shows: micStream.active: true

5. **Speak into mic:**
   - ✅ Visualizer bars should move
   - Console shows VAD: sound detected messages

6. **Stop speaking (or wait for VAD):**
   - ✅ Auto-stops after ~1.5s of silence
   - ✅ Status shows "🔊 Processing..."
   - ✅ Transcription appears in chat
   - ✅ AI responds with speech

### Debug Mode

Double-click the **header** (where it says "AI Voice Chat" / status dot) to toggle the debug banner.

The debug banner shows live values:
- `WS`: WebSocket connection state
- `micStream.active`: Whether the microphone stream is alive
- `isRecording`: Current recording state
- `mediaRecorder`: Whether the mediaRecorder object exists

---

## Next Debugging Step (if recording still fails)

1. Open Chrome DevTools (F12) → Console
2. Look for any `STEP N FAILED` messages — that tells you exactly which step broke
3. Look for `ERROR` messages with stack traces
4. Check debug banner at bottom of screen

### Known edge cases:
- **Chrome blocks mic on HTTP:** Must be `localhost` or HTTPS
- **AudioContext suspended:** Chrome may suspend AudioContext on page load. If `audioCtx.state` is "suspended", call `audioCtx.resume()`
