/**
 * AI Voice Chat — Chrome Extension Popup
 *
 * Connects to the AI Sales Agent backend via WebSocket for real-time
 * voice conversations. Supports both microphone recording and text input.
 *
 * WebSocket Protocol (matching ws_voice.py):
 *   → { type: "text", text: "..." }        — send text message
 *   → Binary frames (audio bytes)           — send microphone audio
 *   ← { type: "transcription", text: "..." }  — STT result
 *   ← { type: "response", text: "...", is_streaming: true }  — LLM chunk
 *   ← { type: "response_done" }             — LLM stream complete
 *   ← { type: "audio", base64: "..." }      — TTS audio playback
 *   ← { type: "connected", conversation_id: "..." }  — session start
 *   ← { type: "error", message: "..." }
 */

// ── State ──────────────────────────────────────────────────────────

const state = {
  ws: null,
  connected: false,
  conversationId: null,
  mediaRecorder: null,
  audioContext: null,
  isRecording: false,
  keepaliveTimer: null,
  audioQueue: [],
  isPlaying: false,
  autoReconnect: true,
  playAudio: true,
  apiBase: 'http://localhost:8000',
  wsBase: 'ws://localhost:8000',
  reconnectTimer: null,
};

// ── DOM References ─────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const chatContainer = $('chat-container');
const statusDot = $('status-dot');
const statusLabel = $('status-label');
const statusText = $('status-text');
const btnMic = $('btn-mic');
const btnSend = $('btn-send');
const txtInput = $('txt-input');
const settingsOverlay = $('settings-overlay');
const btnSettings = $('btn-settings');
const btnCloseSettings = $('btn-close-settings');
const btnSaveSettings = $('btn-save-settings');
const settingApiUrl = $('setting-api-url');
const settingWsUrl = $('setting-ws-url');
const settingAutoReconnect = $('setting-auto-reconnect');
const settingPlayAudio = $('setting-play-audio');
const welcomeMsg = $('welcome-msg');
const recordingVisualizer = $('recording-visualizer');
const visualizerBars = recordingVisualizer?.querySelectorAll('.bar') || [];

// ── Load Settings ─────────────────────────────────────────────────

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('voicechat_settings') || '{}');
    if (saved.apiBase) state.apiBase = saved.apiBase;
    if (saved.wsBase) state.wsBase = saved.wsBase;
    if (saved.autoReconnect !== undefined) state.autoReconnect = saved.autoReconnect;
    if (saved.playAudio !== undefined) state.playAudio = saved.playAudio;

    settingApiUrl.value = state.apiBase;
    settingWsUrl.value = state.wsBase;
    settingAutoReconnect.checked = state.autoReconnect;
    settingPlayAudio.checked = state.playAudio;
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

function saveSettings() {
  state.apiBase = settingApiUrl.value.trim().replace(/\/+$/, '');
  state.wsBase = settingWsUrl.value.trim().replace(/\/+$/, '');
  state.autoReconnect = settingAutoReconnect.checked;
  state.playAudio = settingPlayAudio.checked;

  localStorage.setItem('voicechat_settings', JSON.stringify({
    apiBase: state.apiBase,
    wsBase: state.wsBase,
    autoReconnect: state.autoReconnect,
    playAudio: state.playAudio,
  }));
}

// ── UI Helpers ────────────────────────────────────────────────────

function setStatus(dotClass, label, barText = '', barClass = '') {
  statusDot.className = 'status-dot ' + dotClass;
  statusLabel.textContent = label;
  if (barText) {
    statusText.textContent = barText;
    statusText.className = 'status-text' + (barClass ? ' ' + barClass : '');
  }
}

function addMessage(role, text) {
  // Remove welcome message on first interaction
  if (welcomeMsg && welcomeMsg.parentNode) {
    welcomeMsg.remove();
  }

  const div = document.createElement('div');
  div.className = 'message ' + role;

  let senderLabel = '';
  if (role === 'user') senderLabel = '<div class="sender-label">You</div>';
  else if (role === 'agent') senderLabel = '<div class="sender-label">AI</div>';

  div.innerHTML = senderLabel + '<div class="msg-content">' + escapeHtml(text) + '</div>';
  chatContainer.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.innerHTML = '<div class="msg-content">' + text + '</div>';
  chatContainer.appendChild(div);
  scrollToBottom();
}

function addAudioIndicator() {
  const lastAgentMsg = chatContainer.querySelector('.message.agent:last-child');
  if (lastAgentMsg) {
    const indicator = document.createElement('div');
    indicator.className = 'audio-indicator';
    indicator.textContent = '🔊 Spoken aloud';
    lastAgentMsg.appendChild(indicator);
  }
}

function showTyping() {
  // Remove existing typing indicator
  hideTyping();
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing-indicator';
  div.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  chatContainer.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateMicButton(isRecording) {
  btnMic.classList.toggle('recording', isRecording);
  btnMic.title = isRecording ? 'Release to send (Space)' : 'Hold to talk (Space)';
}

// ── Recording Visualization ──────────────────────────────────────

function startVisualizer() {
  if (!analyserNode || visualizerBars.length === 0) return;

  const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
  recordingVisualizer?.classList.add('active');

  function animate() {
    if (!analyserNode) return;
    analyserNode.getByteFrequencyData(dataArray);

    // Map frequency data to bar heights
    const len = Math.min(visualizerBars.length, dataArray.length);
    for (let i = 0; i < len; i++) {
      // Normalize to 0-100%, apply a minimum of 2px
      const value = dataArray[i] / 255; // 0..1
      const heightPct = Math.max(0.08, value); // at least 8% visible
      visualizerBars[i].style.height = (heightPct * 100) + '%';
    }

    visualizerAnimId = requestAnimationFrame(animate);
  }

  animate();
}

function stopVisualizer() {
  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }
  recordingVisualizer?.classList.remove('active');
  // Reset bars to minimum height
  visualizerBars.forEach(bar => { bar.style.height = ''; });
}

// ── Audio Playback ────────────────────────────────────────────────

async function playBase64Audio(base64Data) {
  try {
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Try using AudioContext first
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(bytes.buffer);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      await new Promise(resolve => { source.onended = resolve; });
      await audioCtx.close();
      return;
    } catch {
      // Fallback: use Audio element for formats AudioContext can't handle
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await new Promise((resolve, reject) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); reject(); };
        audio.play().catch(() => { URL.revokeObjectURL(url); reject(); });
      });
    }
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// ── Microphone Recording ──────────────────────────────────────────

let mediaStream = null;
let mediaRecorder = null;
let recordingStartTime = 0;
let visualizerAnimId = null;
let analyserNode = null;

async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      }
    });

    recordingStartTime = Date.now();

    // Try wav encoding via audioContext for compatibility with Whisper
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(mediaStream);
    const recorder = audioCtx.createScriptProcessor(4096, 1, 1);
    const chunks = [];

    recorder.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      chunks.push(pcm);

      // VAD: analyze audio energy to detect silence
      const rms = analyzeAudioLevel(pcm);
      checkVad(rms);
    };

    source.connect(recorder);

    state.isRecording = true;
    updateMicButton(true);
    setStatus('connected', 'Connected', '🎤 Listening...', 'listening');
    btnMic.disabled = false;

    // Set up AnalyserNode for real-time audio level visualization
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 32;
    source.disconnect();
    source.connect(analyserNode);
    analyserNode.connect(recorder);

    // Start visualization animation loop
    startVisualizer();

    // Store for stopping
    mediaRecorder = { source, recorder, audioCtx, chunks, stream: mediaStream };

    return true;
  } catch (e) {
    console.error('Mic access denied:', e);
    addSystemMessage('⚠️ Microphone access denied. Please allow microphone permissions.');
    setStatus('error', 'Error', 'Mic access denied', 'error');
    state.isRecording = false;
    updateMicButton(false);
    return false;
  }
}

async function stopRecording() {
  if (!mediaRecorder || !state.isRecording) return;

  state.isRecording = false;
  updateMicButton(false);

  // Stop visualization
  stopVisualizer();

  const { source, recorder, audioCtx, chunks, stream } = mediaRecorder;

  // Disconnect and close
  try {
    source.disconnect();
    recorder.disconnect();
    await audioCtx.close();
  } catch (e) { /* ignore */ }

  // Stop all tracks
  stream.getTracks().forEach(t => t.stop());

  // Convert PCM chunks to WAV
  if (chunks.length === 0) {
    setStatus('connected', 'Connected', 'No audio captured', '');
    mediaRecorder = null;
    return;
  }

  // Calculate total length
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;

  const allPcm = new Int16Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    allPcm.set(c, offset);
    offset += c.length;
  }    // Only send if there's meaningful audio (at least 0.3s)
  const durationSec = allPcm.length / 16000;
  if (durationSec < 0.3 || allPcm.length < 4800) {
    setStatus('connected', 'Connected', 'Too short — try again', '');
    mediaRecorder = null;
    return;
  }

  setStatus('connected', 'Connected', 'Processing audio...', 'thinking');
  showTyping();

  // Send raw PCM via WebSocket binary frame
  const wavBuffer = encodeWav(allPcm, 16000);
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(wavBuffer);
  } else {
    addSystemMessage('⚠️ Not connected. Reconnect and try again.');
    setStatus('error', 'Disconnected', 'Connection lost', 'error');
  }

  mediaRecorder = null;
}

function encodeWav(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * bitsPerSample / 8;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }

  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ── Voice Activity Detection (VAD) ───────────────────────────────
// Energy-based VAD: auto-stops recording after ~1.2s of silence

const VAD_CONFIG = {
  SILENCE_THRESHOLD: 0.008,     // RMS threshold for silence (normalized Float32)
  SILENCE_FRAMES_MAX: 5,        // Consecutive silent frames before auto-stop
  MIN_AUDIO_DURATION: 0.5,      // Minimum recording duration before VAD can trigger (seconds)
};

let silenceFrameCount = 0;

function analyzeAudioLevel(pcmChunk) {
  // Calculate RMS (Root Mean Square) audio energy
  let sumSquares = 0;
  for (let i = 0; i < pcmChunk.length; i++) {
    const normalized = pcmChunk[i] / 32768; // Int16 to Float32
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / pcmChunk.length);
  return rms;
}

function checkVad(chunkRms) {
  if (!state.isRecording) return;

  const elapsed = (Date.now() - recordingStartTime) / 1000;
  if (elapsed < VAD_CONFIG.MIN_AUDIO_DURATION) return; // Don't stop too early

  if (chunkRms < VAD_CONFIG.SILENCE_THRESHOLD) {
    silenceFrameCount++;
    if (silenceFrameCount >= VAD_CONFIG.SILENCE_FRAMES_MAX) {
      // Silence detected long enough — auto-stop
      setStatus('connected', 'Connected', '🔇 Silence detected — processing...', 'thinking');
      stopRecording();
    }
  } else {
    silenceFrameCount = 0; // Reset on voice activity
  }
}

// ── AI Speaking Waveform ─────────────────────────────────────────

function showSpeakingWaveform() {
  const visualizer = document.getElementById('speaking-visualizer');
  if (visualizer) visualizer.classList.add('active');
}

function hideSpeakingWaveform() {
  const visualizer = document.getElementById('speaking-visualizer');
  if (visualizer) visualizer.classList.remove('active');
}

// ── Keyboard shortcut for mic (hold Space to talk) ────────────────
// Also supports click-to-start / VAD auto-stop (click once, auto-stop on silence)

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat && !isInputFocused()) {
    e.preventDefault();
    if (state.connected && !state.isRecording) {
      startRecording();
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && !isInputFocused()) {
    e.preventDefault();
    if (state.isRecording) {
      stopRecording();
    }
  }
});

function isInputFocused() {
  return document.activeElement === txtInput ||
         document.activeElement?.tagName === 'INPUT';
}

// ── WebSocket Connection ──────────────────────────────────────────

function connectWebSocket() {
  if (state.ws) {
    try { state.ws.close(); } catch (e) { /* ignore */ }
    state.ws = null;
  }

  // Auto-detect WebSocket protocol from the URL scheme
  // http:// → ws://  ,  https:// → wss://
  let wsUrl = state.wsBase + '/ws/voice';
  try {
    const wsUrlObj = new URL(state.wsBase);
    const wsScheme = wsUrlObj.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrlObj.protocol = wsScheme;
    wsUrl = wsUrlObj.href.replace(/\/+$/, '') + '/ws/voice';
  } catch (e) {
    // If URL parsing fails, use raw wsBase as-is
    console.warn('Could not parse WebSocket URL, using raw:', state.wsBase);
  }
  setStatus('connecting', 'Connecting...', 'Connecting...', '');

  try {
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    ws.onopen = () => {
      state.connected = true;
      setStatus('connected', 'Connected', 'Ready', '');
      btnMic.disabled = false;
      btnSend.disabled = false;
      txtInput.disabled = false;
      txtInput.focus();
      addSystemMessage('✅ Connected to AI Voice Agent');

      // Start keepalive pings every 30 seconds
      if (state.keepaliveTimer) clearInterval(state.keepaliveTimer);
      state.keepaliveTimer = setInterval(() => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Binary audio data from server
        handleAudioBlob(event.data);
        return;
      }

      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            state.conversationId = data.conversation_id;
            console.log('Conversation ID:', state.conversationId);
            break;

          case 'transcription':
            // User speech transcribed — reset any previous streaming
            hideTyping();
            resetStreaming();
            addMessage('user', data.text);
            setStatus('connected', 'Connected', 'AI thinking...', 'thinking');
            break;

          case 'response':
            // LLM streaming chunk - update or create agent message
            handleStreamingResponse(data.text);
            break;

          case 'response_done':
            // LLM stream complete
            hideTyping();
            setStatus('connected', 'Connected', 'Generating speech...', 'speaking');
            break;

          case 'audio':
            // TTS audio playback
            state.audioQueue.push(data.base64);
            processAudioQueue();
            break;

          case 'call_ended':
            hideTyping();
            if (data.summary) {
              addSystemMessage('📋 Call summary: ' + data.summary);
            }
            setStatus('connected', 'Connected', 'Conversation ended', '');
            break;

          case 'error':
            hideTyping();
            addSystemMessage('⚠️ Error: ' + (data.message || 'Unknown error'));
            setStatus('connected', 'Connected', 'Error occurred', 'error');
            break;

          case 'pong':
            // Keepalive response
            break;

          default:
            console.log('Unknown message type:', data.type, data);
        }
      } catch (e) {
        console.warn('Failed to parse WS message:', e);
      }
    };

    ws.onerror = () => {
      setStatus('error', 'Error', 'Connection failed', 'error');
      state.connected = false;
      btnMic.disabled = true;
      btnSend.disabled = true;
      txtInput.disabled = true;
    };

    ws.onclose = () => {
      state.connected = false;
      state.conversationId = null;
      state.isRecording = false;
      updateMicButton(false);
      btnMic.disabled = true;
      btnSend.disabled = true;
      txtInput.disabled = true;
      setStatus('disconnected', 'Disconnected', 'Disconnected', '');

      // Clear keepalive interval
      if (state.keepaliveTimer) {
        clearInterval(state.keepaliveTimer);
        state.keepaliveTimer = null;
      }

      addSystemMessage('🔌 Disconnected from server');

      // Auto-reconnect
      if (state.autoReconnect) {
        state.reconnectTimer = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      }
    };
  } catch (e) {
    setStatus('error', 'Error', 'Connection error: ' + e.message, 'error');
    state.connected = false;
  }
}

// ── Streaming Response Handler ────────────────────────────────────

let streamingBuffer = '';
let streamingMsgEl = null;

function handleStreamingResponse(chunk) {
  hideTyping();
  streamingBuffer += chunk;

  if (!streamingMsgEl) {
    const div = document.createElement('div');
    div.className = 'message agent';
    div.innerHTML = '<div class="sender-label">AI</div><div class="msg-content"></div>';
    chatContainer.appendChild(div);
    streamingMsgEl = div.querySelector('.msg-content');
    scrollToBottom();
  }

  streamingMsgEl.textContent = streamingBuffer;
  scrollToBottom();
}

function resetStreaming() {
  streamingBuffer = '';
  streamingMsgEl = null;
}

// ── Audio Queue Processing ────────────────────────────────────────

async function processAudioQueue() {
  if (state.isPlaying || state.audioQueue.length === 0) return;

  state.isPlaying = true;
  setStatus('connected', 'Connected', '🔊 Speaking...', 'speaking');
  showSpeakingWaveform();

  while (state.audioQueue.length > 0) {
    const base64 = state.audioQueue.shift();
    if (state.playAudio) {
      try {
        await playBase64Audio(base64);
      } catch (e) {
        console.warn('Audio playback error:', e);
      }
    }
  }

  state.isPlaying = false;
  hideSpeakingWaveform();
  setStatus('connected', 'Connected', 'Ready', '');
  addAudioIndicator();
}

function handleAudioBlob(blob) {
  // Convert blob to base64 and queue
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    if (base64) {
      state.audioQueue.push(base64);
      processAudioQueue();
    }
  };
  reader.readAsDataURL(blob);
}

// ── Send Text Message ─────────────────────────────────────────────

function sendTextMessage(text) {
  if (!text.trim() || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  addMessage('user', text);
  txtInput.value = '';
  resetStreaming();
  showTyping();
  setStatus('connected', 'Connected', 'AI thinking...', 'thinking');

  state.ws.send(JSON.stringify({
    type: 'text',
    text: text.trim(),
  }));
}

// ── Disconnect ────────────────────────────────────────────────────

function disconnect() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  if (state.isRecording) {
    stopRecording();
  }

  if (state.ws) {
    try {
      state.ws.send(JSON.stringify({ type: 'end_call' }));
    } catch (e) { /* ignore */ }
    try { state.ws.close(); } catch (e) { /* ignore */ }
    state.ws = null;
  }

  state.connected = false;
  state.conversationId = null;
  btnMic.disabled = true;
  btnSend.disabled = true;
  txtInput.disabled = true;
  updateMicButton(false);
  setStatus('disconnected', 'Disconnected', 'Disconnected', '');
}

// ── Event Handlers ────────────────────────────────────────────────

// Mic button: click to start/stop recording
btnMic.addEventListener('click', () => {
  if (!state.connected) return;

  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// New conversation button: clear chat and reset
const btnNewChat = document.getElementById('btn-new-chat');
btnNewChat.addEventListener('click', () => {
  disconnect();
  chatContainer.innerHTML = '';
  chatContainer.appendChild(welcomeMsg);
  streamingBuffer = '';
  streamingMsgEl = null;
  setTimeout(() => connectWebSocket(), 500);
});

// Send button
btnSend.addEventListener('click', () => {
  if (txtInput.value.trim()) {
    sendTextMessage(txtInput.value);
  }
});

// Enter key to send
txtInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (txtInput.value.trim()) {
      sendTextMessage(txtInput.value);
    }
  }
});

// Settings toggle
btnSettings.addEventListener('click', () => {
  settingsOverlay.hidden = false;
});

btnCloseSettings.addEventListener('click', () => {
  settingsOverlay.hidden = true;
});

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.hidden = true;
  }
});

// Save settings
btnSaveSettings.addEventListener('click', () => {
  saveSettings();
  settingsOverlay.hidden = true;
  disconnect();
  setTimeout(() => connectWebSocket(), 500);
  addSystemMessage('⚙️ Settings saved. Reconnecting...');
});

// ── Initialize ────────────────────────────────────────────────────

loadSettings();
connectWebSocket();

// Handle popup closing cleanup
window.addEventListener('beforeunload', () => {
  if (state.isRecording) {
    mediaStream?.getTracks().forEach(t => t.stop());
  }
});
