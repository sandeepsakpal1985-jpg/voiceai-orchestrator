import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { AddressInfo } from "net";

// ── Mock the shared queries module ──────────────────────────────────

const mockLiveRaw = {
  activeCalls: [
    {
      id: "call-1",
      contactName: "Alice",
      contactPhone: "+15551234567",
      duration: 120,
      status: "IN_PROGRESS",
      sentiment: "POSITIVE",
      createdAt: new Date(),
    },
  ],
  todayTotal: 45,
  todayCompleted: 38,
  inProgressCount: 3,
  totalUsers: 12,
  queuedOrRinging: [{ id: "q1", createdAt: new Date(), status: "QUEUED" }],
  recentCompleted: [{ createdAt: new Date(), startedAt: new Date() }],
};

const mockDashboardRaw = {
  activeCount: 2,
  todayTotal: 45,
  yesterdayTotal: 38,
  inQueueCount: 3,
  inProgressCalls: [{ id: "c1", duration: 120, createdAt: new Date() }],
  queuedCalls: [{ id: "q1", createdAt: new Date() }],
  ringingCalls: [{ id: "r1", createdAt: new Date() }],
  recentCompleted: [{ duration: 120, createdAt: new Date() }],
  totalAgents: 12,
};

vi.mock("../lib/queries", () => ({
  getLiveMonitoringData: vi.fn().mockResolvedValue(mockLiveRaw),
  getRealtimeDashboardData: vi.fn().mockResolvedValue(mockDashboardRaw),
  formatDuration: (d: number | null) =>
    d ? `${Math.floor(d / 60)}m ${(d % 60).toString().padStart(2, "0")}s` : "0m 00s",
  calcAvgWaitSeconds: () => 45,
  calcAvgWaitFromTimestamps: () => 32,
  calcPercentChange: (c: number, p: number) =>
    p > 0 ? Math.round(((c - p) / p) * 100 * 10) / 10 : 0,
}));

// ── Helper: yield to event loop for server message processing ──────

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

// ── Test setup ─────────────────────────────────────────────────────

let server: import("http").Server;
let port: number;
let wsModule: typeof import("../../server/ws-server");

beforeAll(async () => {
  // Set a random port via env
  process.env.WS_PORT = "0";
  // Import after mocks are active
  wsModule = await import("../../server/ws-server");
  server = wsModule.server;

  // Wait for the server to be listening
  await new Promise<void>((resolve, reject) => {
    server.on("listening", () => {
      const addr = server.address() as AddressInfo;
      port = addr.port;
      resolve();
    });
    server.on("error", reject);
    wsModule.startServer(port);
  });
});

afterAll(() => {
  wsModule.stopBroadcasting();
  server.close();
  vi.clearAllMocks();
});

// ── Helper: connect, auth, subscribe ────────────────────────────────

async function connectAndAuth(
  userId: string,
  channels: string[] = ["live-monitoring"]
): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  ws.send(JSON.stringify({ type: "auth", userId }));
  for (const ch of channels) {
    ws.send(JSON.stringify({ type: "subscribe", channel: ch }));
  }
  // Yield to let server process messages
  await tick();
  return ws;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("WebSocket Server (e2e)", () => {
  it("responds to HTTP request on the server port", async () => {
    const res = await fetch(`http://localhost:${port}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("VoiceAI WebSocket Server");
  });

  it("exposes WS metrics at /ws-metrics endpoint", async () => {
    const res = await fetch(`http://localhost:${port}/ws-metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const metrics = await res.json();
    expect(metrics).toHaveProperty("uptime");
    expect(metrics).toHaveProperty("clientCount");
    expect(metrics).toHaveProperty("authenticatedCount");
    expect(metrics).toHaveProperty("totalBroadcasts");
    expect(metrics).toHaveProperty("totalMessagesSent");
    expect(metrics).toHaveProperty("messagesPerBroadcastAvg");
    expect(metrics).toHaveProperty("channels");
    expect(typeof metrics.uptime).toBe("number");
    expect(typeof metrics.clientCount).toBe("number");
  });

  it("WS metrics reflect connected clients", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    ws.send(JSON.stringify({ type: "auth", userId: "metrics-test" }));
    await tick();

    const res = await fetch(`http://localhost:${port}/ws-metrics`);
    const metrics = await res.json();
    expect(metrics.clientCount).toBeGreaterThanOrEqual(1);
    expect(metrics.authenticatedCount).toBeGreaterThanOrEqual(1);

    ws.close();
  });

  it("authenticates a client and receives live-monitoring data", async () => {
    const ws = await connectAndAuth("test-user-1", ["live-monitoring"]);

    wsModule.broadcastUpdates();

    const message = await new Promise<string>((resolve, reject) => {
      ws.on("message", (data: Buffer) => resolve(data.toString()));
      ws.on("error", reject);
      setTimeout(() => reject(new Error("Timeout waiting for message")), 3000);
    });

    const parsed = JSON.parse(message);
    expect(parsed.type).toBe("live-monitoring");
    expect(parsed.activeCalls).toHaveLength(1);
    expect(parsed.activeCalls[0].contact).toBe("Alice");
    expect(parsed.todayTotal).toBe(45);
    expect(parsed.queueCount).toBe(1);
    expect(parsed.activeAgentCount).toBe(12);

    ws.close();
  });

  it("receives both channels when subscribed to both", async () => {
    const ws = await connectAndAuth("test-user-2", [
      "live-monitoring",
      "realtime-dashboard",
    ]);

    wsModule.broadcastUpdates();

    const messages: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on("message", (data: Buffer) => {
        messages.push(data.toString());
        if (messages.length >= 2) resolve();
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("Timeout")), 3000);
    });

    expect(messages.length).toBe(2);
    const types = messages.map((m) => JSON.parse(m).type).sort();
    expect(types).toEqual(["live-monitoring", "realtime-dashboard"]);

    ws.close();
  });

  it("does NOT send data for unauthenticated clients", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Set up message listener BEFORE triggering broadcast
    let gotMessage = false;
    ws.on("message", () => {
      gotMessage = true;
    });

    // Don't send auth — client remains unauthenticated
    ws.send(JSON.stringify({ type: "subscribe", channel: "live-monitoring" }));
    await tick();

    wsModule.broadcastUpdates();

    // Wait briefly — should receive nothing (server skips unauthenticated clients)
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(gotMessage).toBe(false);

    ws.close();
  });

  it("queries are passed the correct userId", async () => {
    const { getLiveMonitoringData } = await import("../lib/queries");
    vi.mocked(getLiveMonitoringData).mockClear();

    const ws = await connectAndAuth("unique-user-id", ["live-monitoring"]);

    wsModule.broadcastUpdates();

    // Wait for message
    await new Promise<void>((resolve, reject) => {
      ws.on("message", () => resolve());
      ws.on("error", reject);
      setTimeout(() => reject(new Error("Timeout")), 3000);
    });

    // Verify the query was called with the correct userId
    expect(getLiveMonitoringData).toHaveBeenCalledWith("unique-user-id");

    ws.close();
  });

  it("unsubscribes from channels", async () => {
    const ws = await connectAndAuth("test-user-3", [
      "live-monitoring",
      "realtime-dashboard",
    ]);

    // Unsubscribe from realtime-dashboard
    ws.send(JSON.stringify({ type: "unsubscribe", channel: "realtime-dashboard" }));
    await tick();

    wsModule.broadcastUpdates();

    // Should only get live-monitoring
    const message = await new Promise<string>((resolve, reject) => {
      ws.on("message", (data: Buffer) => resolve(data.toString()));
      ws.on("error", reject);
      setTimeout(() => reject(new Error("Timeout")), 3000);
    });

    const parsed = JSON.parse(message);
    expect(parsed.type).toBe("live-monitoring");

    ws.close();
  });
});
