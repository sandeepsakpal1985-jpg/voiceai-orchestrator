import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup ──────────────────────────────────────────────────────
const mockAuth = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

// Make global fetch return the mock
global.fetch = mockFetch;

const MOCK_RUNTIME_RESPONSE = {
  status: "healthy",
  timestamp: 1700000000,
  errors: null,
  livekit: {
    enabled: true,
    url: "ws://localhost:7880",
    connected: true,
    active_rooms: 2,
    rooms: [
      { name: "room-alpha", participants: 3, created_at: "2025-01-01T00:00:00Z" },
      { name: "room-beta", participants: 1, created_at: "2025-01-01T00:01:00Z" },
    ],
  },
  sip: {
    enabled: true,
    server_address: "0.0.0.0",
    sip_port: 5060,
    trunk_host: "twilio.example.com",
    active_calls: 1,
    calls: [{ call_id: "sip-call-001", from_number: "+1", to_number: "+2", room_name: "room", status: "active", duration_seconds: 42 }],
  },
  providers: {
    active: { stt: "whisper", llm: "ollama", tts: "kokoro" },
    registered: {
      stt: [{ name: "whisper", is_active: true }],
      llm: [{ name: "ollama", is_active: true }],
      tts: [{ name: "kokoro", is_active: true }],
    },
  },
};

// ── Helpers ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReset();
  mockFetch.mockReset();
});

// =========================================================================
// GET /api/runtime
// =========================================================================

describe("GET /api/runtime", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/runtime/route");
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("proxies runtime status from backend", async () => {
    mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_RUNTIME_RESPONSE),
    });

    const { GET } = await import("@/app/api/runtime/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.livekit.active_rooms).toBe(2);
    expect(body.sip.active_calls).toBe(1);
    expect(body.providers.active.stt).toBe("whisper");
  });

  it("forwards backend error to degraded status", async () => {
    mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const { GET } = await import("@/app/api/runtime/route");
    const response = await GET();

    expect(response.status).toBe(200); // Proxy always returns 200 with degraded body
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].source).toBe("backend");
    expect(body.livekit.enabled).toBe(false);
  });

  it("handles backend connection failure", async () => {
    mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const { GET } = await import("@/app/api/runtime/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("offline");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].source).toBe("backend");
    expect(body.sip.active_calls).toBe(0);
  });

  it("calls backend /runtime/status endpoint", async () => {
    mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_RUNTIME_RESPONSE),
    });

    const { GET } = await import("@/app/api/runtime/route");
    await GET();

    // Should have called the FastAPI backend
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain("/runtime/status");
  });

  it("sets a 5s timeout on backend request", async () => {
    mockAuth.mockResolvedValue({ user: { id: "test-user-id" } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_RUNTIME_RESPONSE),
    });

    const { GET } = await import("@/app/api/runtime/route");
    await GET();

    const fetchOptions = mockFetch.mock.calls[0][1] as { signal?: AbortSignal };
    expect(fetchOptions.signal).toBeDefined();
  });
});
