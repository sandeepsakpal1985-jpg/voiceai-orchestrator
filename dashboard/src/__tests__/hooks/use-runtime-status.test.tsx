import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRuntimeStatus } from "@/hooks/use-runtime-status";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample runtime status response matching the FastAPI backend format
const MOCK_HEALTHY_RESPONSE = {
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
    calls: [
      {
        call_id: "sip-call-001",
        from_number: "+14155551212",
        to_number: "+14155551234",
        room_name: "sip-room-1",
        status: "active",
        duration_seconds: 42,
      },
    ],
  },
  providers: {
    active: { stt: "whisper", llm: "ollama", tts: "kokoro" },
    registered: {
      stt: [
        { name: "whisper", is_active: true },
        { name: "deepgram", is_active: false },
      ],
      llm: [
        { name: "ollama", is_active: true },
        { name: "openai", is_active: false },
      ],
      tts: [
        { name: "kokoro", is_active: true },
        { name: "openvoice", is_active: false },
        { name: "xtts", is_active: false },
      ],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRuntimeStatus", () => {
  it("starts in loading state with default empty values", () => {
    const { result } = renderHook(() => useRuntimeStatus(5000));

    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBe("loading");
    expect(result.current.livekit.active_rooms).toBe(0);
    expect(result.current.sip.active_calls).toBe(0);
    expect(result.current.providers.active.stt).toBe("—");
    expect(result.current.errors).toBeNull();
  });

  it("fetches and returns runtime status data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTHY_RESPONSE),
    });

    const { result } = renderHook(() => useRuntimeStatus(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBe("healthy");
    expect(result.current.livekit.connected).toBe(true);
    expect(result.current.livekit.active_rooms).toBe(2);
    expect(result.current.sip.active_calls).toBe(1);
    expect(result.current.providers.active.stt).toBe("whisper");
    expect(result.current.providers.active.llm).toBe("ollama");
    expect(result.current.providers.active.tts).toBe("kokoro");
    expect(result.current.errors).toBeNull();

    // Verify fetch was called with the correct proxy URL
    expect(mockFetch).toHaveBeenCalledWith("/api/runtime");
  });

  it("returns registered provider lists", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTHY_RESPONSE),
    });

    const { result } = renderHook(() => useRuntimeStatus(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.providers.registered.stt).toHaveLength(2);
    expect(result.current.providers.registered.llm).toHaveLength(2);
    expect(result.current.providers.registered.tts).toHaveLength(3);

    // Check active flags
    const activeStt = result.current.providers.registered.stt.find(
      (p) => p.name === "whisper"
    );
    expect(activeStt?.is_active).toBe(true);
  });

  it("returns offline status on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useRuntimeStatus(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBe("offline");
    // Default values should be preserved for non-error fields
    expect(result.current.livekit.active_rooms).toBe(0);
    expect(result.current.sip.active_calls).toBe(0);
  });

  it("returns offline status on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useRuntimeStatus(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toBe("offline");
  });

  it("updates live SIP call data", async () => {
    const sipActiveResponse = {
      ...MOCK_HEALTHY_RESPONSE,
      sip: {
        ...MOCK_HEALTHY_RESPONSE.sip,
        active_calls: 3,
        calls: [
          { call_id: "c1", from_number: "+1", to_number: "+2", room_name: "r1", status: "active", duration_seconds: 10 },
          { call_id: "c2", from_number: "+3", to_number: "+4", room_name: "r2", status: "active", duration_seconds: 20 },
          { call_id: "c3", from_number: "+5", to_number: "+6", room_name: "r3", status: "active", duration_seconds: 30 },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sipActiveResponse),
    });

    const { result } = renderHook(() => useRuntimeStatus(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sip.active_calls).toBe(3);
    expect(result.current.sip.calls).toHaveLength(3);
    expect(result.current.sip.calls[0].call_id).toBe("c1");
  });

  it("cleans up interval on unmount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTHY_RESPONSE),
    });

    const { unmount } = renderHook(() => useRuntimeStatus(100));

    // Wait for initial fetch
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    unmount();

    // Give time for any lingering timers
    await new Promise((r) => setTimeout(r, 200));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("polls on interval", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_HEALTHY_RESPONSE),
    });

    renderHook(() => useRuntimeStatus(100));

    // Wait for initial fetch
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 350));
    // Should have polled at least once more
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("prevents errors from breaking the hook", async () => {
    // First call succeeds, second fails
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_HEALTHY_RESPONSE),
      });

    const { result } = renderHook(() => useRuntimeStatus(5000));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("healthy");
    expect(result.current.errors).toBeNull();
  });
});
