/**
 * AI Sales Agent Dashboard — Frontend Application
 *
 * Provides:
 * - Real-time dashboard metrics from the backend API
 * - WebSocket-based voice chat interface
 * - Call monitoring and conversation management
 * - Provider configuration UI
 */

// ── Configuration ──────────────────────────────────────────────────

const CONFIG = {
  apiBase: localStorage.getItem("apiUrl") || "http://localhost:8000",
  wsBase: localStorage.getItem("wsUrl") || "ws://localhost:8000",
  refreshInterval: parseInt(localStorage.getItem("refreshInterval") || "15", 10),
};

let refreshTimer = null;
let chatWebSocket = null;
let conversationId = null;

// ── API Client ─────────────────────────────────────────────────────

const api = {
  async get(path) {
    try {
      const res = await fetch(`${CONFIG.apiBase}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`GET ${path}:`, e);
      return null;
    }
  },

  async post(path, body) {
    try {
      const res = await fetch(`${CONFIG.apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`POST ${path}:`, e);
      return null;
    }
  },
};

// ── Navigation ────────────────────────────────────────────────────

function navigateTo(section) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));

  document.getElementById(`section-${section}`)?.classList.add("active");
  document.querySelector(`[data-section="${section}"]`)?.classList.add("active");
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => navigateTo(item.dataset.section));
});

// ── Dashboard ─────────────────────────────────────────────────────

async function refreshDashboard() {
  const health = await api.get("/health");
  const calls = await api.get("/calls");
  const conversations = await api.get("/conversations");

  const activeCalls = calls ? (Array.isArray(calls) ? calls : []).filter((c) => c.status === "active") : [];
  const convList = conversations ? (Array.isArray(conversations) ? conversations : []) : [];

  document.getElementById("metric-total-calls").textContent = calls ? (Array.isArray(calls) ? calls.length : "0") : "—";
  document.getElementById("metric-active-calls").textContent = activeCalls.length;
  document.getElementById("metric-active-calls").style.color = activeCalls.length > 0 ? "var(--green)" : "";
  document.getElementById("metric-conversations").textContent = convList.length;

  if (health && health.uptime) {
    const seconds = health.uptime;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    document.getElementById("metric-uptime").textContent = `${h}h ${m}m`;
  } else {
    document.getElementById("metric-uptime").textContent = "—";
  }

  document.getElementById("active-call-count").textContent = activeCalls.length;
  document.getElementById("active-call-count").style.display = activeCalls.length > 0 ? "" : "none";

  // Provider status
  const providersEl = document.getElementById("provider-status");
  if (health && health.providers) {
    providersEl.innerHTML = Object.entries(health.providers)
      .map(
        ([name, status]) => `
        <div class="provider-item">
          <span class="provider-name">${name}</span>
          <span class="provider-status ${status === "ok" || status === true ? "ok" : "error"}">
            ${status === "ok" || status === true ? "✓ Active" : "✗ Unavailable"}
          </span>
        </div>`
      )
      .join("");
  } else if (health) {
    providersEl.innerHTML = `<div class="provider-item"><span class="provider-name">System</span><span class="provider-status ok">✓ Online</span></div>`;
  } else {
    providersEl.innerHTML = `<div class="provider-item"><span class="provider-name">Server</span><span class="provider-status error">✗ Offline</span></div>`;
  }

  // Recent conversations
  const recentEl = document.getElementById("recent-conversations");
  if (convList.length > 0) {
    recentEl.innerHTML = convList
      .slice(-5)
      .reverse()
      .map(
        (c) => `
        <div class="conversation-item" onclick="navigateTo('conversations')">
          <div class="conversation-header">
            <span class="conversation-contact">${c.contact_name || c.contact_phone || "Unknown"}</span>
            <span class="conversation-time">${c.created_at ? new Date(c.created_at).toLocaleTimeString() : ""}</span>
          </div>
          <div class="conversation-preview">${c.status || "in_progress"}</div>
        </div>`
      )
      .join("");
  } else {
    recentEl.innerHTML = `<div class="loading">No conversations yet</div>`;
  }

  // Server status
  const statusEl = document.getElementById("server-status");
  if (health) {
    statusEl.innerHTML = `<span class="status-dot online"></span><span>Connected</span>`;
  }
}

// ── Calls ─────────────────────────────────────────────────────────

async function refreshCalls() {
  const calls = await api.get("/calls");
  const body = document.getElementById("calls-table-body");
  const list = calls && Array.isArray(calls) ? calls : [];

  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">No active calls</td></tr>`;
    return;
  }

  body.innerHTML = list
    .map(
      (c) => `
    <tr>
      <td><code>${(c.call_sid || c.id || "—").slice(0, 20)}</code></td>
      <td>${c.from_number || c.contact_phone || "—"}</td>
      <td>
        <span class="call-status">
          <span class="dot ${(c.status || "active") === "active" ? "active" : "ended"}"></span>
          ${c.status || "active"}
        </span>
      </td>
      <td>${c.duration ? `${Math.round(c.duration)}s` : "—"}</td>
      <td>
        ${c.status === "active" ? `<button class="btn btn-secondary" onclick="endCall('${c.call_sid || c.id}')">End Call</button>` : "—"}
      </td>
    </tr>`
    )
    .join("");
}

async function endCall(callId) {
  if (!confirm("End this call?")) return;
  await api.post(`/calls/${callId}/end`, {});
  refreshCalls();
}

// ── Conversations ─────────────────────────────────────────────────

async function refreshConversations() {
  const conversations = await api.get("/conversations");
  const list = conversations && Array.isArray(conversations) ? conversations : [];
  const el = document.getElementById("conversations-list");

  if (list.length === 0) {
    el.innerHTML = `<div class="loading">No conversations found</div>`;
    return;
  }

  el.innerHTML = list
    .slice()
    .reverse()
    .map(
      (c) => `
    <div class="conversation-item">
      <div class="conversation-header">
        <span class="conversation-contact">${c.contact_name || c.contact_phone || "Unknown"}</span>
        <span class="conversation-time">${c.created_at ? new Date(c.created_at).toLocaleString() : "—"}</span>
      </div>
      <div class="conversation-preview">
        Status: ${c.status || "in_progress"} | Messages: ${(c.messages || []).length} | ID: ${c.id.slice(0, 8)}...
      </div>
    </div>`
    )
    .join("");
}

// ── Voice Chat ────────────────────────────────────────────────────

function appendMessage(role, content) {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML =
    role !== "system"
      ? `<div class="sender">${role === "user" ? "You" : "Agent"}</div><div>${content}</div>`
      : `<div>${content}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function setChatStatus(text, className = "") {
  const el = document.getElementById("chat-status");
  el.innerHTML = `<span class="status-text ${className}">${text}</span>`;
}

async function startVoiceChat() {
  const btn = document.getElementById("btn-start-chat");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("btn-send");

  if (chatWebSocket) {
    chatWebSocket.close();
    chatWebSocket = null;
    btn.textContent = "🎤 Start Chat";
    input.disabled = true;
    sendBtn.disabled = true;
    setChatStatus("Disconnected", "disconnected");
    return;
  }

  btn.textContent = "⏳ Connecting...";
  setChatStatus("Connecting...", "");

  try {
    chatWebSocket = new WebSocket(`${CONFIG.wsBase}/ws/voice`);

    chatWebSocket.onopen = () => {
      btn.textContent = "🔴 Disconnect";
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
      setChatStatus("Connected — ready to chat", "connected");
      appendMessage("system", "Connected to AI Sales Agent. Type your message to start.");
    };

    chatWebSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "transcript" || data.type === "text") {
          appendMessage("user", data.text || data.content || data.data || "");
        } else if (data.type === "response" || data.type === "agent" || data.type === "tts") {
          appendMessage("agent", data.text || data.content || data.data || "");
        } else if (data.type === "error") {
          appendMessage("system", `⚠ ${data.message || data.text || "Error"}`);
        } else if (data.type === "state") {
          // Update status from state engine
          appendMessage("system", `State: ${data.state || "—"} | Emotion: ${data.emotion || "—"}`);
        } else if (data.text) {
          // Fallback: treat any text as agent response
          if (data.role === "user") {
            appendMessage("user", data.text);
          } else {
            appendMessage("agent", data.text);
          }
        }
      } catch {
        // Plain text response
        appendMessage("agent", event.data);
      }
      setChatStatus("Connected", "connected");
    };

    chatWebSocket.onerror = () => {
      appendMessage("system", "⚠ WebSocket error — check server connection");
      setChatStatus("Connection error", "disconnected");
    };

    chatWebSocket.onclose = () => {
      btn.textContent = "🎤 Start Chat";
      input.disabled = true;
      sendBtn.disabled = true;
      setChatStatus("Disconnected", "disconnected");
      chatWebSocket = null;
    };
  } catch (e) {
    appendMessage("system", `⚠ Failed to connect: ${e.message}`);
    btn.textContent = "🎤 Start Chat";
    setChatStatus("Connection failed", "disconnected");
  }
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !chatWebSocket) return;

  appendMessage("user", text);
  input.value = "";
  setChatStatus("Agent thinking...", "thinking");

  if (chatWebSocket.readyState === WebSocket.OPEN) {
    chatWebSocket.send(JSON.stringify({ text, type: "transcript" }));
  } else {
    // Fallback: use REST API
    appendMessage("system", "WebSocket disconnected — using HTTP fallback");
    const conv = await api.post("/conversations", {
      contact_name: "Dashboard User",
      contact_phone: "dashboard",
      metadata: { source: "dashboard" },
    });
    if (conv && conv.id) {
      const result = await api.post(`/conversations/${conv.id}/process`, {
        user_input: text,
        system_prompt: "You are a helpful AI sales agent. Respond conversationally.",
      });
      if (result && result.response) {
        appendMessage("agent", result.response);
      }
    }
    setChatStatus("Connected", "connected");
  }
}

// ── Keyboard shortcut ─────────────────────────────────────────────

document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// ── Settings ──────────────────────────────────────────────────────

function saveSettings() {
  const apiUrl = document.getElementById("setting-api-url").value.trim();
  const wsUrl = document.getElementById("setting-ws-url").value.trim();
  const refresh = parseInt(document.getElementById("setting-refresh").value, 10) || 15;

  localStorage.setItem("apiUrl", apiUrl);
  localStorage.setItem("wsUrl", wsUrl);
  localStorage.setItem("refreshInterval", String(refresh));

  CONFIG.apiBase = apiUrl;
  CONFIG.wsBase = wsUrl;
  CONFIG.refreshInterval = refresh;

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshDashboard, refresh * 1000);

  alert("Settings saved! Refreshing data...");
  refreshDashboard();
  refreshCalls();
}

// ─── Provider Config Change Handlers ──────────────────────────────

document.getElementById("config-stt")?.addEventListener("change", (e) => {
  api.post("/agents/configure", { stt_provider: e.target.value });
});

document.getElementById("config-llm")?.addEventListener("change", (e) => {
  api.post("/agents/configure", { llm_provider: e.target.value });
});

document.getElementById("config-tts")?.addEventListener("change", (e) => {
  api.post("/agents/configure", { tts_provider: e.target.value });
});

// ── Load settings ─────────────────────────────────────────────────

function loadSettings() {
  document.getElementById("setting-api-url").value = CONFIG.apiBase;
  document.getElementById("setting-ws-url").value = CONFIG.wsBase;
  document.getElementById("setting-refresh").value = CONFIG.refreshInterval;
}

// ── Init ──────────────────────────────────────────────────────────

async function init() {
  loadSettings();
  await refreshDashboard();
  await refreshCalls();
  await refreshConversations();

  refreshTimer = setInterval(async () => {
    await refreshDashboard();
    await refreshCalls();
  }, CONFIG.refreshInterval * 1000);
}

document.addEventListener("DOMContentLoaded", init);
